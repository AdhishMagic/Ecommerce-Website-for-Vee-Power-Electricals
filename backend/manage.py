#!/usr/bin/env python
import os
import sys

def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc

    # Harden StatReloader against Windows/Docker shared volume I/O errors (e.g. Errno 5)
    try:
        from django.utils import autoreload
        _orig_watched_files = autoreload.StatReloader.watched_files

        def _safe_watched_files(self, include_globs=True):
            gen = _orig_watched_files(self, include_globs=include_globs)
            while True:
                try:
                    yield next(gen)
                except StopIteration:
                    break
                except OSError:
                    continue

        autoreload.StatReloader.watched_files = _safe_watched_files
    except Exception:
        pass

    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()
