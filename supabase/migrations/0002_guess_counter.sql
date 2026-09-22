-- Tracks guesses made on the player's *current* word (resets to 0 whenever
-- current_word_index advances). Lets the guess route check "out of guesses"
-- from the player row it already has to update, instead of a separate
-- COUNT query against the guesses table on every request.
alter table players add column if not exists guesses_this_word int not null default 0;
