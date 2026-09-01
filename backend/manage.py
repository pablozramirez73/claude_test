#!/usr/bin/env python
"""Utility a riga di comando per le attivita' amministrative di Django."""
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Django non risulta importabile. E' installato e l'ambiente "
            "virtuale e' attivo?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
