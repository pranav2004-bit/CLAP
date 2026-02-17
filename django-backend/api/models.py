"""
Django Models for CLAP Application
Maps to existing Supabase PostgreSQL database schema
DO NOT run migrations - these models point to existing tables
"""

import uuid
from django.db import models
from django.utils import timezone


class User(models.Model):
    """Maps to 'users' table in Supabase"""
    
    ROLE_CHOICES = [
        ('student', 'Student'),
        ('admin', 'Admin'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, max_length=255)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    full_name = models.CharField(max_length=255, null=True, blank=True)
    username = models.CharField(max_length=100, null=True, blank=True)
    student_id = models.CharField(max_length=50, unique=True, null=True, blank=True)
    password_hash = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    profile_completed = models.BooleanField(default=False)
    batch = models.ForeignKey('Batch', on_delete=models.SET_NULL, null=True, blank=True, db_column='batch_id')
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        db_table = 'users'
        managed = False  # Don't let Django manage this table
        
    def __str__(self):
        return f"{self.email} ({self.role})"


class Batch(models.Model):
    """Maps to 'batches' table in Supabase"""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch_name = models.CharField(max_length=50, unique=True)
    start_year = models.IntegerField()
    end_year = models.IntegerField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'batches'
        managed = False
        
    def __str__(self):
        return self.batch_name


class Test(models.Model):
    """Maps to 'tests' table in Supabase"""
    
    TEST_TYPE_CHOICES = [
        ('listening', 'Listening'),
        ('speaking', 'Speaking'),
        ('reading', 'Reading'),
        ('writing', 'Writing'),
        ('vocabulary', 'Vocabulary'),
    ]
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('published', 'Published'),
        ('archived', 'Archived'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.TextField()
    type = models.CharField(max_length=20, choices=TEST_TYPE_CHOICES)
    duration_minutes = models.IntegerField()
    total_questions = models.IntegerField()
    instructions = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        db_table = 'tests'
        managed = False
        
    def __str__(self):
        return f"{self.name} ({self.type})"


class Question(models.Model):
    """Maps to 'questions' table in Supabase"""
    
    QUESTION_TYPE_CHOICES = [
        ('mcq', 'Multiple Choice'),
        ('fill_blank', 'Fill in the Blank'),
        ('essay', 'Essay'),
        ('audio_response', 'Audio Response'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    test = models.ForeignKey(Test, on_delete=models.CASCADE, db_column='test_id', related_name='questions')
    question_text = models.TextField()
    question_type = models.CharField(max_length=20, choices=QUESTION_TYPE_CHOICES)
    options = models.JSONField(null=True, blank=True)
    correct_answer = models.TextField(null=True, blank=True)
    audio_url = models.TextField(null=True, blank=True)
    image_url = models.TextField(null=True, blank=True)
    points = models.IntegerField(default=1)
    order_index = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        db_table = 'questions'
        managed = False
        ordering = ['order_index']
        
    def __str__(self):
        return f"Question {self.order_index} - {self.test.name}"


class TestAttempt(models.Model):
    """Maps to 'test_attempts' table in Supabase"""
    
    STATUS_CHOICES = [
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('abandoned', 'Abandoned'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id')
    test = models.ForeignKey(Test, on_delete=models.CASCADE, db_column='test_id')
    started_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    max_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='in_progress')
    answers = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        db_table = 'test_attempts'
        managed = False
        
    def __str__(self):
        return f"{self.user.email} - {self.test.name} ({self.status})"


class ClapTest(models.Model):
    """Maps to 'clap_tests' table in Supabase"""
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('published', 'Published'),
        ('archived', 'Archived'),
        ('deleted', 'Deleted'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    test_id = models.CharField(max_length=50, unique=True, null=True, blank=True)  # clap1, clap2...
    name = models.CharField(max_length=255)
    batch = models.ForeignKey(Batch, on_delete=models.CASCADE, db_column='batch_id', null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column='created_by')
    
    class Meta:
        db_table = 'clap_tests'
        managed = False
        
    def __str__(self):
        return f"{self.test_id}: {self.name}" if self.test_id else self.name


class ClapTestIdCounter(models.Model):
    """
    Tracks the last used ID number for CLAP tests
    Ensures monotonic increase even if tests are deleted
    """
    last_number = models.IntegerField(default=0)
    
    class Meta:
        db_table = 'clap_test_id_counter'
        # Let Django manage this table since it's new



class ClapTestComponent(models.Model):
    """Maps to 'clap_test_components' table in Supabase"""
    
    TEST_TYPE_CHOICES = [
        ('listening', 'Listening'),
        ('speaking', 'Speaking'),
        ('reading', 'Reading'),
        ('writing', 'Writing'),
        ('vocabulary', 'Vocabulary'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('active', 'Active'),
        ('completed', 'Completed'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clap_test = models.ForeignKey(ClapTest, on_delete=models.CASCADE, db_column='clap_test_id', related_name='components')
    test_type = models.CharField(max_length=20, choices=TEST_TYPE_CHOICES)
    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    max_marks = models.IntegerField(default=10)
    duration_minutes = models.IntegerField(default=30)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        db_table = 'clap_test_components'
        managed = False
        
    def __str__(self):
        return f"{self.clap_test.name} - {self.title}"


class StudentClapAssignment(models.Model):
    """Maps to 'student_clap_assignments' table in Supabase"""
    
    STATUS_CHOICES = [
        ('assigned', 'Assigned'),
        ('started', 'Started'),
        ('completed', 'Completed'),
        ('expired', 'Expired'),
        ('test_deleted', 'Test Deleted'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(User, on_delete=models.CASCADE, db_column='student_id')
    clap_test = models.ForeignKey(ClapTest, on_delete=models.CASCADE, db_column='clap_test_id')
    assigned_at = models.DateTimeField(default=timezone.now)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='assigned')
    total_score = models.IntegerField(null=True, blank=True)
    
    class Meta:
        db_table = 'student_clap_assignments'
        managed = False
        unique_together = [['student', 'clap_test']]
        
    def __str__(self):
        return f"{self.student.email} - {self.clap_test.name}"


class ClapTestItem(models.Model):
    """Maps to 'clap_test_items' table in Supabase"""
    
    ITEM_TYPE_CHOICES = [
        ('mcq', 'Multiple Choice'),
        ('subjective', 'Subjective / Essay'),
        ('text_block', 'Text Block / Instructions'),
        ('audio_block', 'Audio Block'),
        ('file_upload', 'File Upload'),
        ('audio_recording', 'Audio Recording'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    component = models.ForeignKey(ClapTestComponent, on_delete=models.CASCADE, db_column='component_id', related_name='items')
    item_type = models.CharField(max_length=50, choices=ITEM_TYPE_CHOICES)
    order_index = models.IntegerField()
    points = models.IntegerField(default=0)
    content = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'clap_test_items'
        managed = False
        ordering = ['order_index']
        
    def __str__(self):
        return f"{self.component.title} - Item {self.order_index} ({self.item_type})"


class StudentClapResponse(models.Model):
    """Maps to 'student_clap_responses' table in Supabase"""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assignment = models.ForeignKey(StudentClapAssignment, on_delete=models.CASCADE, db_column='assignment_id', related_name='responses')
    item = models.ForeignKey(ClapTestItem, on_delete=models.CASCADE, db_column='item_id')
    response_data = models.JSONField(null=True, blank=True)
    is_correct = models.BooleanField(null=True, blank=True)
    marks_awarded = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    feedback = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'student_clap_responses'
        managed = False
        unique_together = [['assignment', 'item']]
        
    def __str__(self):
        return f"Response to {self.item} by {self.assignment.student.email}"


class StudentAudioResponse(models.Model):
    """
    Stores audio recording submissions for CLAP tests
    Links to StudentClapResponse for evaluation results
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Relationships
    assignment = models.ForeignKey(
        StudentClapAssignment,
        on_delete=models.CASCADE,
        db_column='assignment_id',
        related_name='audio_responses'
    )
    item = models.ForeignKey(
        ClapTestItem,
        on_delete=models.CASCADE,
        db_column='item_id'
    )
    response = models.OneToOneField(
        StudentClapResponse,
        on_delete=models.CASCADE,
        db_column='response_id',
        null=True,
        blank=True,
        related_name='audio_file'
    )

    # Audio file metadata
    file_path = models.CharField(max_length=500)  # Relative to MEDIA_ROOT
    file_size = models.IntegerField()  # Bytes
    mime_type = models.CharField(max_length=50)  # audio/webm, audio/mp4, etc.
    duration_seconds = models.DecimalField(max_digits=6, decimal_places=2)

    # Timestamps
    recorded_at = models.DateTimeField(default=timezone.now)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    # Processing status (for future auto-transcription)
    transcription = models.TextField(null=True, blank=True)
    transcribed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'student_audio_responses'
        managed = True  # This is a new table, Django manages it
        unique_together = [['assignment', 'item']]
        indexes = [
            models.Index(fields=['assignment', 'item']),
            models.Index(fields=['uploaded_at']),
        ]

    def __str__(self):
        return f"Audio Response: {self.item} by {self.assignment.student.email}"

    def get_file_url(self):
        """Generate authenticated URL for file access"""
        return f"/api/student/audio-responses/{self.id}/file"

    def delete_file(self):
        """Delete physical file from filesystem"""
        import os
        from django.conf import settings
        full_path = os.path.join(settings.MEDIA_ROOT, self.file_path)
        if os.path.exists(full_path):
            os.remove(full_path)


class AdminAudioFile(models.Model):
    """
    Stores admin-uploaded audio files for audio_block items
    Used for playing audio clips to students
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Relationships
    item = models.OneToOneField(
        ClapTestItem,
        on_delete=models.CASCADE,
        db_column='item_id',
        related_name='admin_audio'
    )
    uploaded_by = models.UUIDField(db_column='uploaded_by', null=True)

    # Audio file metadata
    file_path = models.CharField(max_length=500)  # Relative to MEDIA_ROOT
    file_size = models.IntegerField()  # Bytes
    mime_type = models.CharField(max_length=50)  # audio/mpeg, audio/wav, etc.
    duration_seconds = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    original_filename = models.CharField(max_length=255)

    # Timestamps
    uploaded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'admin_audio_files'
        managed = True  # This is a new table, Django manages it
        indexes = [
            models.Index(fields=['item'], name='idx_admin_audio_item'),
        ]

    def __str__(self):
        return f"Admin Audio: {self.original_filename} for {self.item}"

    def get_file_url(self):
        """Generate authenticated URL for file access"""
        return f"/api/student/clap-items/{self.item_id}/audio"

    def delete_file(self):
        """Delete physical file from filesystem"""
        import os
        from django.conf import settings
        full_path = os.path.join(settings.MEDIA_ROOT, self.file_path)
        if os.path.exists(full_path):
            os.remove(full_path)
