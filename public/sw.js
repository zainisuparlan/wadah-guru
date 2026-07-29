// Service Worker sederhana untuk PWA Admin Panel Wadah Guru
const CACHE_NAME = 'wg-admin-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Biarkan fetch berjalan seperti biasa
});
