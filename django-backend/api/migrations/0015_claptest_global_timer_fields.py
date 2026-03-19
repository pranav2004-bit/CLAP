from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0014_assessmentsubmission_llm_failed_domains'),
    ]

    operations = [
        migrations.AddField(
            model_name='claptest',
            name='global_duration_minutes',
            field=models.IntegerField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name='claptest',
            name='global_deadline',
            field=models.DateTimeField(null=True, blank=True, db_column='global_deadline'),
        ),
    ]
