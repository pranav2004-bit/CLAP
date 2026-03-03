import os
import django
from django.db import connection

def fix_constraints():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clap_backend.settings')
    django.setup()
    
    print("Starting database constraint update...")
    
    with connection.cursor() as cursor:
        try:
            # 1. Update StudentClapAssignment status check
            print("Updating student_clap_assignments_status_check...")
            cursor.execute("""
                ALTER TABLE student_clap_assignments 
                DROP CONSTRAINT IF EXISTS student_clap_assignments_status_check;
            """)
            cursor.execute("""
                ALTER TABLE student_clap_assignments 
                ADD CONSTRAINT student_clap_assignments_status_check 
                CHECK (status IN ('assigned', 'started', 'completed', 'expired', 'test_deleted'));
            """)
            print("Successfully updated student_clap_assignments_status_check.")
            
            # 2. Update ClapTest status check (just in case)
            print("Updating clap_tests_status_check...")
            cursor.execute("""
                ALTER TABLE clap_tests 
                DROP CONSTRAINT IF EXISTS clap_tests_status_check;
            """)
            cursor.execute("""
                ALTER TABLE clap_tests 
                ADD CONSTRAINT clap_tests_status_check 
                CHECK (status IN ('draft', 'published', 'archived', 'deleted'));
            """)
            print("Successfully updated clap_tests_status_check.")
            
            print("\nDatabase constraints fixed successfully!")
            
        except Exception as e:
            print(f"\nError fixing constraints: {e}")
            raise

if __name__ == "__main__":
    fix_constraints()
