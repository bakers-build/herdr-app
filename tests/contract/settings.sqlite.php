<?php

/**
 * @file
 * Contract test only: replaces the image's settings.container.php (mounted read-only).
 *
 * The image's file pins the MySQL driver; the contract run uses SQLite, so it needs
 * no database container. tests/contract/run.ts copies config/sync to /tmp/sync and
 * adds the sqlite module there, since the site's own config enables mysql only.
 */

$databases['default']['default'] = [
  'database' => getenv('DB_NAME'),
  'driver' => 'sqlite',
  'namespace' => 'Drupal\\sqlite\\Driver\\Database\\sqlite',
  'autoload' => 'core/modules/sqlite/src/Driver/Database/sqlite/',
  'prefix' => '',
];
$settings['hash_salt'] = getenv('DRUPAL_HASH_SALT');
$settings['trusted_host_patterns'] = ['.*'];
$settings['config_sync_directory'] = '/tmp/sync';
$settings['file_private_path'] = '/tmp/private';
