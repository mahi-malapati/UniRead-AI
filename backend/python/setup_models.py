import argparse
import shutil
import tempfile
from urllib.request import urlopen
import zipfile
from pathlib import Path

from speech_models import MODEL_ARCHIVES, get_model_directory

MODELS_DIRECTORY = Path(__file__).resolve().parent / "models"


def install_model(language: str) -> None:
    model_name, url = MODEL_ARCHIVES[language]
    destination = get_model_directory(language, MODELS_DIRECTORY)
    if (destination / "conf" / "model.conf").is_file():
        print(f"{language} speech model is already installed.")
        return

    MODELS_DIRECTORY.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=MODELS_DIRECTORY, prefix=f".{model_name}-") as temp:
        temp_path = Path(temp)
        archive_path = temp_path / f"{model_name}.zip"
        print(f"Downloading {language} speech model from {url} ...", flush=True)
        with urlopen(url, timeout=45) as response, archive_path.open("wb") as archive_file:
            total_bytes = int(response.headers.get("Content-Length", "0"))
            downloaded_bytes = 0
            while chunk := response.read(1024 * 1024):
                archive_file.write(chunk)
                downloaded_bytes += len(chunk)
                if total_bytes:
                    print(
                        f"  {downloaded_bytes / total_bytes:.0%} "
                        f"({downloaded_bytes / (1024 * 1024):.1f}/{total_bytes / (1024 * 1024):.1f} MB)",
                        flush=True,
                    )

        with zipfile.ZipFile(archive_path) as archive:
            root = temp_path.resolve()
            for entry in archive.infolist():
                if not (temp_path / entry.filename).resolve().is_relative_to(root):
                    raise ValueError(f"Unsafe path in the {language} model archive.")
            archive.extractall(temp_path)

        extracted_model = temp_path / model_name
        if not (extracted_model / "conf" / "model.conf").is_file():
            raise RuntimeError(f"The downloaded {language} archive did not contain a valid Vosk model.")

        if destination.exists():
            shutil.rmtree(destination)
        shutil.move(str(extracted_model), str(destination))
        print(f"Installed {language} speech model in {destination}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Download offline Vosk speech-recognition models.")
    parser.add_argument(
        "languages",
        nargs="*",
        choices=tuple(MODEL_ARCHIVES),
        default=["English"],
        help="Models to install; defaults to English. Spanish and Hindi are optional additional downloads.",
    )
    args = parser.parse_args()
    for language in args.languages:
        install_model(language)


if __name__ == "__main__":
    main()
