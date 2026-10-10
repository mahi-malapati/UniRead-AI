import io
import json
import logging
import os
import re
import tempfile
import threading
import wave
from pathlib import Path
from typing import Literal

import pyttsx3
import vosk
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from speech_models import MODEL_ARCHIVES, get_model_directory

logger = logging.getLogger("uniread.speech")
speech_lock = threading.Lock()
model_lock = threading.Lock()
speech_models: dict[str, vosk.Model] = {}
MAX_AUDIO_BYTES = 20 * 1024 * 1024
RECOGNITION_SAMPLE_RATE = 16_000


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=50_000)
    voice: Literal["female", "male"] = "female"
    language: Literal["English", "Spanish", "Hindi"] = "English"

    @field_validator("text", mode="before")
    @classmethod
    def trim_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class VoiceUnavailableError(Exception):
    pass


class SpeechModelUnavailableError(Exception):
    pass


class InvalidAudioError(Exception):
    pass


LANGUAGE_PATTERNS = {
    "English": re.compile(r"\benglish\b|\ben(?:[-_][a-z]{2})?\b", re.IGNORECASE),
    "Spanish": re.compile(r"\bspanish\b|\bes(?:[-_][a-z]{2})?\b", re.IGNORECASE),
    "Hindi": re.compile(r"\bhindi\b|\bhi(?:[-_]in)?\b", re.IGNORECASE),
}

GENDER_NAME_HINTS = {
    "female": ("zira", "hedda", "hazel", "aria", "jenny", "female", "woman"),
    "male": ("david", "mark", "guy", "ryan", "male", "man"),
}


def _voice_metadata(voice: object) -> str:
    languages = getattr(voice, "languages", ()) or ()
    decoded_languages = [
        item.decode("utf-8", errors="ignore") if isinstance(item, bytes) else str(item)
        for item in languages
    ]
    return " ".join(
        [str(getattr(voice, "id", "")), str(getattr(voice, "name", "")), *decoded_languages]
    )


def _supports_language(voice: object, language: str) -> bool:
    return bool(LANGUAGE_PATTERNS[language].search(_voice_metadata(voice)))


def _supports_gender(voice: object, gender: str) -> bool:
    voice_gender = str(getattr(voice, "gender", "")).lower()
    if gender in voice_gender:
        return True
    metadata = _voice_metadata(voice).lower()
    return any(hint in metadata for hint in GENDER_NAME_HINTS[gender])


def _select_voice(voices: list[object], gender: str, language: str) -> object:
    language_voices = [voice for voice in voices if _supports_language(voice, language)]
    if not language_voices:
        raise VoiceUnavailableError(
            f"No {language} speech voice is installed on this computer. Add a {language} text-to-speech voice in your operating system settings."
        )

    matching_voices = [voice for voice in language_voices if _supports_gender(voice, gender)]
    if not matching_voices:
        raise VoiceUnavailableError(
            f"No {gender} {language} speech voice is installed on this computer. Add a matching text-to-speech voice in your operating system settings."
        )
    return matching_voices[0]


def synthesize_speech(text: str, gender: str, language: str) -> bytes:
    output_path: Path | None = None
    engine = None
    with speech_lock:
        try:
            engine = pyttsx3.init()
            selected_voice = _select_voice(engine.getProperty("voices"), gender, language)
            engine.setProperty("voice", selected_voice.id)
            engine.setProperty("rate", 175)

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as audio_file:
                output_path = Path(audio_file.name)

            engine.save_to_file(text, str(output_path))
            engine.runAndWait()
            audio = output_path.read_bytes()
            if not audio:
                raise RuntimeError("The speech engine produced an empty audio file.")
            return audio
        finally:
            if engine is not None:
                engine.stop()
            if output_path is not None:
                output_path.unlink(missing_ok=True)


def get_speech_model(language: str) -> vosk.Model:
    if language not in speech_models:
        with model_lock:
            if language not in speech_models:
                model_path = get_model_directory(language, Path(os.getenv(
                    "VOSK_MODEL_DIR",
                    str(Path(__file__).resolve().parent / "models"),
                )))
                if not (model_path / "conf" / "model.conf").is_file():
                    raise SpeechModelUnavailableError(
                        f"The {language} offline speech model is not installed. From backend/python run: python setup_models.py {language}"
                    )
                speech_models[language] = vosk.Model(str(model_path))
    return speech_models[language]


def _transcribe_audio(audio_bytes: bytes, language: str) -> str:
    try:
        with wave.open(io.BytesIO(audio_bytes), "rb") as audio:
            if (
                audio.getnchannels() != 1
                or audio.getsampwidth() != 2
                or audio.getframerate() != RECOGNITION_SAMPLE_RATE
                or audio.getcomptype() != "NONE"
            ):
                raise InvalidAudioError("Audio must be uncompressed, mono, 16-bit WAV at 16 kHz.")

            recognizer = vosk.KaldiRecognizer(get_speech_model(language), RECOGNITION_SAMPLE_RATE)
            transcripts = []
            while chunk := audio.readframes(8_000):
                if recognizer.AcceptWaveform(chunk):
                    transcript = json.loads(recognizer.Result()).get("text", "").strip()
                    if transcript:
                        transcripts.append(transcript)
            transcript = json.loads(recognizer.FinalResult()).get("text", "").strip()
            if transcript:
                transcripts.append(transcript)
            return " ".join(transcripts)
    except wave.Error as error:
        raise InvalidAudioError("The microphone recording was not a valid WAV audio file.") from error


app = FastAPI(title="UniRead offline speech service")

cors_options = {
    "allow_methods": ["GET", "POST"],
    "allow_headers": ["Content-Type"],
}
configured_origins = os.getenv("FRONTEND_ORIGINS", "").strip()
if configured_origins:
    cors_options["allow_origins"] = [
        origin.strip() for origin in configured_origins.split(",") if origin.strip()
    ]
else:
    cors_options["allow_origins"] = []
    cors_options["allow_origin_regex"] = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
app.add_middleware(CORSMiddleware, **cors_options)


@app.get("/api/health")
async def health() -> dict[str, str | list[str]]:
    models_root = Path(os.getenv(
        "VOSK_MODEL_DIR",
        str(Path(__file__).resolve().parent / "models"),
    ))
    return {
        "status": "ok",
        "speech": "offline",
        "recognitionLanguages": [
            language
            for language in MODEL_ARCHIVES
            if (get_model_directory(language, models_root) / "conf" / "model.conf").is_file()
        ],
    }


@app.post("/api/speech")
async def speech(request: SpeechRequest) -> Response:
    try:
        audio = await run_in_threadpool(
            synthesize_speech,
            request.text,
            request.voice,
            request.language,
        )
    except VoiceUnavailableError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("Offline speech synthesis failed.")
        raise HTTPException(
            status_code=500,
            detail="Offline speech synthesis failed. Check that your computer has a working text-to-speech voice installed.",
        ) from error

    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/api/transcribe")
async def transcribe(
    request: Request,
    language: Literal["English", "Spanish", "Hindi"] = Query(default="English"),
) -> dict[str, str]:
    if not request.headers.get("content-type", "").lower().startswith("audio/wav"):
        raise HTTPException(status_code=415, detail="Send microphone audio as a WAV file.")

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_AUDIO_BYTES:
                raise HTTPException(status_code=413, detail="Recording is too large. Stop and try a shorter recording.")
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Invalid audio content length.") from error

    audio_bytes = bytearray()
    async for chunk in request.stream():
        audio_bytes.extend(chunk)
        if len(audio_bytes) > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Recording is too large. Stop and try a shorter recording.")
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="No microphone audio was received.")

    try:
        transcript = await run_in_threadpool(_transcribe_audio, bytes(audio_bytes), language)
    except SpeechModelUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except InvalidAudioError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("Offline speech recognition failed.")
        raise HTTPException(
            status_code=500,
            detail="Offline speech recognition failed. Check that the Vosk model is installed and try another recording.",
        ) from error
    return {"text": transcript}
