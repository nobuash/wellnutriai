-- Add diabetes_type to nutrition_questionnaires
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'diabetes_type') THEN
    CREATE TYPE diabetes_type AS ENUM ('none', 'type1', 'type2', 'pre_diabetes');
  END IF;
END $$;

ALTER TABLE nutrition_questionnaires
  ADD COLUMN IF NOT EXISTS diabetes_type diabetes_type NOT NULL DEFAULT 'none';
