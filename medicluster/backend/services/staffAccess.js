const normEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

function staffEmails() {
  return (process.env.ALLOWED_STAFF_EMAILS || '').split(',').map(normEmail).filter(Boolean);
}

function staffAllowed(email) {
  const emails = staffEmails();
  return emails.length === 0 || emails.includes(normEmail(email));
}

module.exports = { normEmail, staffEmails, staffAllowed };
