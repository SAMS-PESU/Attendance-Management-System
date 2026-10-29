import jwt from 'jsonwebtoken';

const VALID_ROLES = new Set(['admin', 'teacher', 'student']);

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header) {
    return res.status(401).json({ message: 'Authentication required. No authorization header provided.' });
  }

  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Invalid authorization format. Format must be Bearer <token>.' });
  }

  const token = header.slice(7).trim();
  if (!token) {
    return res.status(401).json({ message: 'Authentication token required.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload || !payload.id || !payload.role) {
      return res.status(401).json({ message: 'Invalid token payload.' });
    }
    if (!VALID_ROLES.has(payload.role)) {
      return res.status(403).json({ message: 'Unrecognized user role in token.' });
    }
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Authentication token has expired. Please log in again.' });
    }
    return res.status(401).json({ message: 'Invalid or malformed authentication token.' });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Forbidden: role '${req.user.role}' is not authorized for this resource.`
      });
    }
    next();
  };
}
