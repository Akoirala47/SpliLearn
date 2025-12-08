-- Add subpoint_index to videos table to associate videos with specific subpoints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'videos' 
        AND column_name = 'subpoint_index'
    ) THEN
        ALTER TABLE videos ADD COLUMN subpoint_index integer;
    END IF;
END $$;

-- Create video_completions table to track user progress
CREATE TABLE IF NOT EXISTS video_completions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE,
  completed_at timestamp with time zone DEFAULT now(),
  watched_duration integer DEFAULT 0, -- seconds watched
  is_manually_completed boolean DEFAULT false,
  UNIQUE(user_id, video_id)
);

-- Enable RLS
ALTER TABLE video_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own completions"
ON video_completions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert/update their own completions"
ON video_completions FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

