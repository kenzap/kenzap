import * as path from 'path';

export function getTemplatesPath() {
    return process.env.NODE_ENV === 'development'
        ? path.join(__dirname, "..", "templates")
        : path.join(process.resourcesPath, 'templates');
}
