from django.apps import AppConfig

class CommonConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.common'

    def ready(self):
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
