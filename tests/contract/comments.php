<?php

/**
 * @file
 * Contract test only: `drush php:script comments.php -- <ticket uuid> <user>` writes two plan
 * comments on the ticket, an hour apart, so the folded older comments (loaded: false,
 * commentBody) exist in the seeded world. Prints the ids.
 */

[$uuid, $name] = [$extra[0] ?? throw new \RuntimeException('No ticket uuid.'), $extra[1] ?? 'fixture-agent'];
$etm = \Drupal::entityTypeManager();
$tickets = $etm->getStorage('bb_ticket')->loadByProperties(['uuid' => $uuid]);
$ticket = reset($tickets) ?: throw new \RuntimeException("No ticket $uuid.");
$users = $etm->getStorage('user')->loadByProperties(['name' => $name]);
$user = reset($users) ?: throw new \RuntimeException("No user $name.");
\Drupal::service('account_switcher')->switchTo($user);
$storage = $etm->getStorage('bb_comment');
$ids = [];
foreach ([3600 => 'Contract plan, older', 0 => 'Contract plan, newer'] as $ago => $body) {
  $comment = $storage->create([
    'bundle' => 'bb_comment',
    'bb_comment_type' => 'plan',
    'ticket_id' => $ticket->id(),
    'body' => ['value' => $body, 'format' => 'plain_text'],
    'uid' => $user->id(),
    'created' => time() - $ago,
  ]);
  $comment->save();
  $ids[] = $comment->id();
}
print implode(',', $ids) . "\n";
