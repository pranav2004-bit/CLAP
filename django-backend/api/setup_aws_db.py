import psycopg2
import sys

def setup_aws():
    try:
        conn = psycopg2.connect(
            host='host.docker.internal',
            port=5433,
            dbname='postgres',
            user='postgres',
            password='SANJIVO_CLAP',
            sslmode='prefer'
        )
        conn.autocommit = True
        cur = conn.cursor()
        
        print("Creating auth schema...")
        cur.execute('CREATE SCHEMA IF NOT EXISTS auth;')
        
        print("Creating compatibility functions...")
        cur.execute('CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;')
        cur.execute('CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT \'anon\'::text $$;')
        
        print("Creating extensions schema...")
        cur.execute('CREATE SCHEMA IF NOT EXISTS extensions;')
        
        print("Creating uuid-ossp extension...")
        cur.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;')
        
        print("✅ AWS Environment Setup Successful")
        conn.close()
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    setup_aws()
