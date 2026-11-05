ALTER TABLE resumes ADD COLUMN owner TEXT NOT NULL DEFAULT '';
CREATE INDEX resumes_owner ON resumes(owner,created_at);
CREATE TABLE demo_usage (day TEXT NOT NULL, subject TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(day,subject));
