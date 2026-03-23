import psycopg2
import sys

def audit():
    try:
        conn = psycopg2.connect(
            host='host.docker.internal',
            port=5433,
            dbname='postgres',
            user='postgres',
            password='SANJIVO_CLAP',
            sslmode='prefer'
        )
        cur = conn.cursor()
        
        print("--- AWS DATABASE AUDIT ---")
        
        # 1. Check schemas
        cur.execute("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%%' AND schema_name != 'information_schema';")
        schemas = [r[0] for r in cur.fetchall()]
        print(f"Schemas found: {schemas}")
        
        # 2. Check tables count per schema
        for schema in schemas:
            cur.execute(f"SELECT count(*) FROM information_schema.tables WHERE table_schema = '{schema}';")
            count = cur.fetchone()[0]
            print(f"Schema '{schema}': {count} tables")
            
            if count > 0:
                cur.execute(f"SELECT table_name FROM information_schema.tables WHERE table_schema = '{schema}' LIMIT 10;")
                tables = [r[0] for r in cur.fetchall()]
                print(f"  Example tables: {tables}")
        
        # 3. Data Audit
        print("\n--- DATA AUDIT ---")
        tables_to_check = ['users', 'batches', 'clap_tests', 'clap_test_components', 'clap_test_items']
        for table in tables_to_check:
            try:
                cur.execute(f"SELECT count(*) FROM public.{table}")
                count = cur.fetchone()[0]
                print(f"✅ public.{table}: {count} rows")
            except Exception as e:
                print(f"❌ public.{table}: Error - {e}")
                conn.rollback() # Important to reset transaction after error
                
        conn.close()
        print("\nAudit Complete.")
        
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    audit()
