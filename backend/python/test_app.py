import asyncio
import io
import os
import tempfile
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from speech_models import MODEL_ARCHIVES
from app import (
    InvalidAudioError,
    SpeechModelUnavailableError,
    SpeechRequest,
    VoiceUnavailableError,
    app,
    _select_voice,
    _transcribe_audio,
    speech,
    transcribe,
)


def make_audio_request(body: bytes, content_type: str = "audio/wav") -> Request:
    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": body, "more_body": False}

    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/transcribe",
            "headers": [
                (b"content-type", content_type.encode()),
                (b"content-length", str(len(body)).encode()),
            ],
            "query_string": b"",
            "server": ("test", 80),
            "client": ("test", 1234),
            "scheme": "http",
            "http_version": "1.1",
            "app": None,
            "root_path": "",
        },
        receive=receive,
    )


class SpeechServiceTests(unittest.TestCase):
    def test_health_endpoint_reports_installed_recognition_languages(self) -> None:
        with tempfile.TemporaryDirectory() as models_root:
            model_config = (
                Path(models_root)
                / MODEL_ARCHIVES["English"][0]
                / "conf"
                / "model.conf"
            )
            model_config.parent.mkdir(parents=True)
            model_config.write_text("", encoding="utf-8")

            with patch.dict(os.environ, {"VOSK_MODEL_DIR": models_root}):
                with TestClient(app) as client:
                    response = client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["recognitionLanguages"], ["English"])

    def test_trims_text_and_applies_voice_defaults(self) -> None:
        request = SpeechRequest(text="  Read this aloud.  ")

        self.assertEqual(request.text, "Read this aloud.")
        self.assertEqual(request.voice, "female")
        self.assertEqual(request.language, "English")

    def test_selects_requested_installed_voice(self) -> None:
        voices = [
            SimpleNamespace(id="david", name="Microsoft David", gender="Male", languages=["en-US"]),
            SimpleNamespace(id="zira", name="Microsoft Zira", gender="Female", languages=["en-US"]),
        ]

        self.assertEqual(_select_voice(voices, "female", "English").id, "zira")
        self.assertEqual(_select_voice(voices, "male", "English").id, "david")

    def test_reports_when_language_voice_is_missing(self) -> None:
        voices = [SimpleNamespace(id="zira", name="Microsoft Zira", gender="Female", languages=["en-US"])]

        with self.assertRaisesRegex(VoiceUnavailableError, "No Hindi speech voice"):
            _select_voice(voices, "female", "Hindi")

    def test_speech_endpoint_returns_wave_audio(self) -> None:
        request = SpeechRequest(text="Read this aloud.")
        with patch("app.run_in_threadpool", new_callable=AsyncMock, return_value=b"RIFFtest") as synthesize:
            response = asyncio.run(speech(request))

        self.assertEqual(response.media_type, "audio/wav")
        self.assertEqual(response.body, b"RIFFtest")
        self.assertEqual(response.headers["cache-control"], "no-store")
        synthesize.assert_awaited_once()
        self.assertEqual(synthesize.await_args.args[0].__name__, "synthesize_speech")
        self.assertEqual(synthesize.await_args.args[1:], ("Read this aloud.", "female", "English"))

    def test_speech_endpoint_surfaces_missing_voice(self) -> None:
        request = SpeechRequest(text="Read this aloud.")
        with patch(
            "app.run_in_threadpool",
            new_callable=AsyncMock,
            side_effect=VoiceUnavailableError("No Hindi speech voice is installed."),
        ):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(speech(request))

        self.assertEqual(error.exception.status_code, 422)
        self.assertIn("Hindi speech voice", error.exception.detail)

    def test_transcription_rejects_unsupported_wav_format(self) -> None:
        output = io.BytesIO()
        with wave.open(output, "wb") as audio:
            audio.setnchannels(2)
            audio.setsampwidth(2)
            audio.setframerate(16_000)
            audio.writeframes(b"\0\0" * 64)

        with self.assertRaisesRegex(InvalidAudioError, "mono"):
            _transcribe_audio(output.getvalue(), "English")

    def test_transcription_rejects_invalid_wav_data(self) -> None:
        with self.assertRaisesRegex(InvalidAudioError, "valid WAV"):
            _transcribe_audio(b"not wav data", "English")

    def test_transcription_endpoint_returns_offline_transcript(self) -> None:
        body = b"RIFFfake wav data"
        request = make_audio_request(body)
        with patch("app.run_in_threadpool", new_callable=AsyncMock, return_value="offline recognized text") as recognize:
            result = asyncio.run(transcribe(request, "English"))

        self.assertEqual(result, {"text": "offline recognized text"})
        recognize.assert_awaited_once()
        self.assertEqual(recognize.await_args.args[1:], (body, "English"))

    def test_transcription_endpoint_rejects_non_wav_audio(self) -> None:
        request = make_audio_request(b"recording", "audio/webm")

        with self.assertRaises(HTTPException) as error:
            asyncio.run(transcribe(request, "English"))

        self.assertEqual(error.exception.status_code, 415)

    def test_transcription_endpoint_explains_when_model_is_missing(self) -> None:
        body = b"RIFFfake wav data"
        request = make_audio_request(body)
        with patch(
            "app.run_in_threadpool",
            new_callable=AsyncMock,
            side_effect=SpeechModelUnavailableError("Install the Hindi offline model."),
        ):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(transcribe(request, "Hindi"))

        self.assertEqual(error.exception.status_code, 503)
        self.assertIn("Hindi offline model", error.exception.detail)


if __name__ == "__main__":
    unittest.main()
