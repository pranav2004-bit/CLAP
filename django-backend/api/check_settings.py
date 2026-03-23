import os
import django
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clap_backend.settings')
django.setup()

db = settings.DATABASES['default']
print("--- DJANGO DB SETTINGS ---")
print(f"ENGINE: {db.get('ENGINE')}")
print(f"NAME: {db.get('NAME')}")
print(f"USER: {db.get('USER')}")
print(f"HOST: {db.get('HOST')}")
print(f"PORT: {db.get('PORT')}")
print(f"SSLMODE: {db.get('OPTIONS', {}).get('sslmode')}")
