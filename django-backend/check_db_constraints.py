import os
import django
from django.db import connection

def check_constraints():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clap_backend.settings')
    django.setup()
    
    with connection.cursor() as cursor:
        with open('constraints_report.txt', 'w', encoding='utf-8') as f:
            f.write("--- Constraints for student_clap_assignments ---\n")
            cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_clap_assignments'")
            if not cursor.fetchone():
                f.write("Table 'student_clap_assignments' not found in public schema.\n")
                return

            cursor.execute("""
                SELECT 
                    conname as constraint_name, 
                    pg_get_constraintdef(c.oid) as constraint_definition
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON t.relnamespace = n.oid
                WHERE t.relname = 'student_clap_assignments'
                AND n.nspname = 'public';
            """)
            rows = cursor.fetchall()
            print(f"Found {len(rows)} constraints")
            for row in rows:
                print(f"NAME: {row[0]}")
                print(f"DEF: {row[1]}")
                f.write(f"NAME: {row[0]}\n")
                f.write(f"DEF: {row[1]}\n")
                f.write("-" * 20 + "\n")

if __name__ == "__main__":
    check_constraints()
