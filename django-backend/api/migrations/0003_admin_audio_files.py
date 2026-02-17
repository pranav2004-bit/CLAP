from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0002_claptestitem_studentclapresponse_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='AdminAudioFile',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('uploaded_by', models.UUIDField(db_column='uploaded_by', null=True)),
                ('file_path', models.CharField(max_length=500)),
                ('file_size', models.IntegerField()),
                ('mime_type', models.CharField(max_length=50)),
                ('duration_seconds', models.DecimalField(decimal_places=2, max_digits=6, null=True)),
                ('original_filename', models.CharField(max_length=255)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('item', models.OneToOneField(
                    db_column='item_id',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='admin_audio',
                    to='api.claptestitem'
                )),
            ],
            options={
                'db_table': 'admin_audio_files',
                'managed': True,
            },
        ),
        migrations.RunSQL(
            sql="CREATE INDEX idx_admin_audio_item ON admin_audio_files(item_id);",
            reverse_sql="DROP INDEX idx_admin_audio_item;"
        ),
    ]
