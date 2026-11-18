<?php

/**
 * @file
 * Contract test only: `drush php:script key.php -- <user>` prints a new API key of that
 * user as client_id:secret (bb_api_key, exchanged at /oauth/token with
 * client_credentials, the way the bakers CLI gets a token, without a browser).
 */

$name = $extra[0] ?? 'fixture-agent';
$users = \Drupal::entityTypeManager()->getStorage('user')->loadByProperties(['name' => $name]);
$user = reset($users) ?: throw new \RuntimeException("No user $name.");
// The consumer's user reference is validated as the current user.
\Drupal::service('account_switcher')->switchTo($user);
$key = \Drupal::service('bb_api_key.manager')->create($user, 'herdr-app contract test', time() + 3600);
print $key['consumer']->get('client_id')->value . ':' . $key['secret'] . "\n";
