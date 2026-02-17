[16/02/2]

Added 'audio_recording' to clap_test_items.item_type CHECK constraint.

SQL Applied:
ALTER TABLE clap_test_items
DROP CONSTRAINT clap_test_items_item_type_check;

ALTER TABLE clap_test_items
ADD CONSTRAINT clap_test_items_item_type_check
CHECK (item_type IN ('mcq', 'subjective', 'text_block', 'audio_block', 'file_upload', 'audio_recording'));
