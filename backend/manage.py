#!/usr/bin/env python
"""Utility a riga di comando per le attività amministrative di Django."""
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Django non risulta importabile. È installato e l'ambiente "
            "virtuale è attivo?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
