
import os
import django

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clap_backend.settings')
django.setup()

from api.models import ClapTest, ClapTestIdCounter
from django.db import transaction

def backfill_ids():
    print("\n🛠️ STARTING BACKFILL PROCESS...\n")

    # 1. Get all tests ordered by creation time (Oldest first)
    tests = ClapTest.objects.all().order_by('created_at')
    
    if not tests.exists():
        print("ℹ️ No existing tests found to backfill.")
        return

    print(f"📋 Found {tests.count()} existing tests.")

    # 2. Initialize Counter
    # We want to start from 0 if no counter exists, or continue from existing
    counter, created = ClapTestIdCounter.objects.get_or_create(id=1)
    
    # Resetting counter to 0 to regenerate IDs for consistency? 
    # NO: We should respect if some already have IDs.
    # But usually, it's safer to just fill the empty ones.
    
    updated_count = 0
    
    with transaction.atomic():
        # First, find the highest used number if any (to avoid conflicts)
        current_max = counter.last_number
        
        # Or should we re-assign EVERYTHING to ensure sequential clap1, clap2...?
        # User implies "clap1... clapN" for ALL tests.
        # Let's try to assign IDs to those that lack them first.
        
        for test in tests:
            if not test.test_id:
                counter.last_number += 1
                test.test_id = f"clap{counter.last_number}"
                test.save()
                print(f"   ✅ Assigned '{test.test_id}' to test: {test.name}")
                updated_count += 1
            else:
                print(f"   ℹ️ Skipped '{test.name}' (Already has ID: {test.test_id})")
        
        # Save the final counter state
        counter.save()

    print(f"\n🎉 BACKFILL COMPLETE!")
    print(f"   Updated {updated_count} tests.")
    print(f"   New Counter Value: {counter.last_number}")

if __name__ == "__main__":
    backfill_ids()
