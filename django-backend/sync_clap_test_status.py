
import os
import django

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clap_backend.settings')
django.setup()

from api.models import ClapTest

def sync_status():
    print("\n🔄 SYNCING CLAP TEST STATUS...\n")
    
    # 1. Update Assigned Tests to 'published'
    updated_published = ClapTest.objects.filter(batch_id__isnull=False).exclude(status='published').update(status='published')
    if updated_published > 0:
        print(f"✅ Updated {updated_published} assigned tests to 'published' status.")
    
    # 2. Update Unassigned Tests to 'draft'
    updated_draft = ClapTest.objects.filter(batch_id__isnull=True).exclude(status='draft').update(status='draft')
    if updated_draft > 0:
        print(f"✅ Updated {updated_draft} unassigned tests to 'draft' status.")
        
    print("\n🎉 SYNC COMPLETE!")

if __name__ == "__main__":
    sync_status()
