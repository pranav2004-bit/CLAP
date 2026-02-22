"""DRF serializers for submission pipeline endpoints."""

from rest_framework import serializers

from api.models import AssessmentSubmission, StudentClapAssignment


class SubmissionCreateSerializer(serializers.Serializer):
    assignment_id = serializers.UUIDField()
    idempotency_key = serializers.CharField(max_length=64)
    correlation_id = serializers.CharField(max_length=64, required=False, allow_blank=True)

    def validate(self, attrs):
        user = self.context['user']
        assignment_id = attrs['assignment_id']
        try:
            assignment = StudentClapAssignment.objects.select_related('clap_test', 'student').get(
                id=assignment_id,
                student=user,
            )
        except StudentClapAssignment.DoesNotExist as exc:
            raise serializers.ValidationError({'assignment_id': 'Assignment not found for this student.'}) from exc

        attrs['assignment'] = assignment
        attrs['assessment'] = assignment.clap_test
        return attrs


class SubmissionStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentSubmission
        fields = ('id', 'status', 'created_at', 'updated_at', 'report_url')

