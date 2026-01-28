const bannedWords = [
  "instagram",
  "insta",
  "facebook",
  "fb",
  "twitter",
  "x.com",
  "snapchat",
  "snap",
  "whatsapp",
  "telegram",
  "t.me",
  "discord",
  "linkedin",
  "gmail",
  "email",
  "phone",
];

const linkRegex = /(https?:\/\/|www\.|\.com|\.net|\.org|\.io|\.me)/i;

function containsBlockedContent(text) {
  const lower = text.toLowerCase();

  const hasBannedWord = bannedWords.some((word) => lower.includes(word));

  const hasLink = linkRegex.test(lower);

  return hasBannedWord || hasLink;
}

module.exports = containsBlockedContent;
