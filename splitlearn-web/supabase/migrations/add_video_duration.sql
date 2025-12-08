-- Add duration column to videos table if it doesn't exist
-- This migration adds the duration field to store video length in seconds

DO $$
BEGIN
    -- Check if the column exists, if not, add it
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'videos' 
        AND column_name = 'duration'
    ) THEN
        ALTER TABLE videos ADD COLUMN duration integer;
        RAISE NOTICE 'Added duration column to videos table';
    ELSE
        RAISE NOTICE 'duration column already exists in videos table';
    END IF;
END $$;

