function isSuspicious(text) {
  const patterns = [
    /\b\d{7,}\b/, // phone numbers
    /@/,
    /(call|text|dm|reach me)/i,
    /(outside|off platform)/i,
  ];

  return patterns.some((p) => p.test(text));
}

module.exports = isSuspicious;
