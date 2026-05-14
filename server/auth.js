import {
  deleteSession,
  findUserByToken,
} from './services/localStore.js';

function readBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  return header.slice(7).trim();
}

export async function authOptional(req, _res, next) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      req.authUser = null;
      return next();
    }

    const user = await findUserByToken(token);
    req.authUser = user
      ? {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status,
          token,
        }
      : null;

    if (!user && token) {
      await deleteSession(token);
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.authUser) {
    const error = new Error('Unauthorized. Please login.');
    error.statusCode = 401;
    return next(error);
  }
  return next();
}

export function requireAdmin(req, _res, next) {
  if (!req.authUser) {
    const error = new Error('Unauthorized. Please login.');
    error.statusCode = 401;
    return next(error);
  }
  if (req.authUser.role !== 'admin') {
    const error = new Error('Admin access required.');
    error.statusCode = 403;
    return next(error);
  }
  return next();
}
