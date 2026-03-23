import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clap_backend.settings')
django.setup()

def audit_database():
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_schema NOT IN ('information_schema', 'pg_catalog') 
            ORDER BY table_schema, table_name;
        """)
        tables = cursor.fetchall()
        
        print("\n--- DATABASE AUDIT REPORT ---")
        if not tables:
            print("❌ No tables found in any schema!")
        else:
            current_schema = ""
            for schema, table in tables:
                if schema != current_schema:
                    print(f"\n📂 Schema: {schema}")
                    current_schema = schema
                print(f"  - {table}")
        
        print("\n--- DATA CHECK ---")
        try:
            cursor.execute("SELECT COUNT(*) FROM public.users")
            count = cursor.fetchone()[0]
            print(f"✅ public.users: {count} records found.")
        except Exception as e:
            msg = str(e).splitlines()[0]
            print(f"❌ public.users: Table missing or inaccessible. ({msg})")

if __name__ == "__main__":
    audit_database()
