from pathlib import Path

MODEL_ARCHIVES = {
    "English": ("vosk-model-small-en-us-0.15", "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"),
    "Spanish": ("vosk-model-small-es-0.42", "https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip"),
    "Hindi": ("vosk-model-small-hi-0.22", "https://alphacephei.com/vosk/models/vosk-model-small-hi-0.22.zip"),
}


def get_model_directory(language: str, root: Path | None = None) -> Path:
    model_name, _ = MODEL_ARCHIVES[language]
    model_root = root or Path(__file__).resolve().parent / "models"
    return model_root / model_name
