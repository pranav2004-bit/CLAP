import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clap_backend.settings')
django.setup()

from django.db import connection

def verify_constraint():
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT check_clause 
            FROM information_schema.check_constraints 
            WHERE constraint_name = 'clap_test_items_item_type_check';
        """)
        row = cursor.fetchone()
        if row:
            print(f"Constraint Definition: {row[0]}")
            if 'audio_recording' in row[0]:
                print("Verification: 'audio_recording' IS in the constraint.")
            else:
                print("Verification: 'audio_recording' IS NOT in the constraint.")
        else:
            print("Constraint 'clap_test_items_item_type_check' not found.")

if __name__ == "__main__":
    verify_constraint()
