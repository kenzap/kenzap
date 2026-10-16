'use strict';

function imageRepository(value, slug, local) {
    let repository = String(value || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!repository && local) return `kenzap-local/${slug}`;
    if (!repository || /[\s?#@$]/.test(repository) || /(^|\/)\.\.?($|\/)/.test(repository)) throw new Error('Enter an image repository, such as registry.example.com/team/my-app.');
    if (!repository.includes('/')) repository += '/' + slug;
    if (!/^[a-z0-9][a-z0-9.:-]*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)+$/.test(repository)) throw new Error('Use a lowercase image repository without an image tag or embedded credentials.');
    new URL('https://' + registryHost(repository));
    return repository;
}

function registryHost(repository) {
    const first = repository.split('/')[0];
    return first.includes('.') || first.includes(':') || first === 'localhost' ? first : 'index.docker.io';
}

module.exports = { imageRepository, registryHost };
