# Banned words for names (German and English)

> Content warning: this list contains offensive words, because that is what it blocks. Source of the list: `backend/src/services/name-filter-terms.js`. This file was generated from it; administrators can add more words in the admin area (Names). Proposed rule: BR27 in [business-rules.md](business-rules.md) (section 9).

Applies to: nicknames, first and last names (sign-up and admin edits) and team names (creation and admin rename).

## How words are matched

Every name is split into words (spaces, punctuation, and a lower-to-upper change such as BigAss). Each word is lower-cased, accents are removed (ß becomes ss) and look-alike characters are turned into letters (0 o, 1 i, 3 e, 4 a, 5 s, 7 t, @ a, $ s, ! i). Repeated letters beyond two are shortened (fuuuck). Single letters written apart (f.u.c.k) are joined.

- **Whole-word list:** a word is blocked only when the entire word equals a listed term. `Cass`, `Classic`, `Assistant`, `Scunthorpe`, `Hancock` and `Dickens` stay allowed, but `Ass` and `Big Ass` do not.
- **Anywhere-in-word list:** long, unambiguous words are blocked even inside a longer word (for example a word that starts with one of them).

Real names that equal an offensive word (for example the surname Depp or Schwanz, or the first name Dick) were left out on purpose. Please review the list; a name that is blocked by mistake can be allowed by removing the word from the source file.

## Blocked anywhere inside a word (33)

fuck, motherfucker, shit, bitch, bastard, asshole, arsehole, dickhead, cocksucker, whore, wanker, bollocks, pussy, nigger, nigga, faggot, retard, hitler, jackass, douche, scheisse, scheiss, arschloch, wichser, hurensohn, fotze, votze, schlampe, missgeburt, schwuchtel, kanake, vollidiot, drecksau

## Blocked as a whole word (45)

ass, arse, tit, tits, cunt, cunts, cock, cocks, dicks, twat, sex, slut, sluts, rape, rapist, nazi, nazis, kkk, fag, fags, paki, spic, chink, porn, piss, wtf, stfu, arsch, hure, nutte, fick, ficken, pimmel, titten, muschi, spast, spasti, neger, nutten, kacke, scheisskerl, bumsen, wixer, penis, vagina
