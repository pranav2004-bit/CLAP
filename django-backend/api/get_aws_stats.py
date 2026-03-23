import os
import django
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clap_backend.settings')
django.setup()

from api.models import User, Batch, ClapTest, ClapTestComponent, ClapTestItem

def get_stats():
    stats = {
        'users': User.objects.count(),
        'batches': Batch.objects.count(),
        'clap_tests': ClapTest.objects.count(),
        'clap_test_components': ClapTestComponent.objects.count(),
        'clap_test_items': ClapTestItem.objects.count(),
    }
    print("---AWS_STATS_START---")
    for tbl, count in stats.items():
        print(f"{tbl}:{count}")
    print("---AWS_STATS_END---")

if __name__ == "__main__":
    get_stats()
