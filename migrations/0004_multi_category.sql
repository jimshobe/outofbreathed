-- A moment can belong to several categories. moments.category stays as the primary (first chosen)
-- one; this table holds all of them and is what the category filters query.
CREATE TABLE moment_categories (
  moment_id  TEXT NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('misc', 'family', 'travel', 'moto', 'food')),
  PRIMARY KEY (moment_id, category)
) WITHOUT ROWID;

CREATE INDEX moment_categories_category ON moment_categories (category, moment_id);

INSERT INTO moment_categories (moment_id, category) SELECT id, category FROM moments;
