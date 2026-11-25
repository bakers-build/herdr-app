<?php

/**
 * @file
 * Contract test only: `drush php:script comments.php -- <ticket uuid> <user>` writes two plan
 * comments on the ticket, an hour apart, so the folded older comments (loaded: false,
 * commentBody) exist in the seeded world. Links them through the ticket's comments field and
 * ticket_id where present, verifies them, and prints the ids and counts.
 */

[$uuid, $name] = [$extra[0] ?? throw new \RuntimeException('No ticket uuid.'), $extra[1] ?? 'fixture-agent'];
$etm = \Drupal::entityTypeManager();
$tickets = $etm->getStorage('bb_ticket')->loadByProperties(['uuid' => $uuid]);
$ticket = reset($tickets) ?: throw new \RuntimeException("No ticket $uuid.");
$users = $etm->getStorage('user')->loadByProperties(['name' => $name]);
$user = reset($users) ?: throw new \RuntimeException("No user $name.");
\Drupal::service('account_switcher')->switchTo($user);
$storage = $etm->getStorage('bb_comment');
$bundleKey = $etm->getDefinition('bb_comment')->getKey('bundle');

$ids = [];
foreach ([3600 => 'Contract plan, older', 0 => 'Contract plan, newer'] as $ago => $body) {
  $values = [
    'bb_comment_type' => 'plan',
    'body' => ['value' => $body, 'format' => 'plain_text'],
    'uid' => $user->id(),
    'created' => time() - $ago,
  ];
  if ($bundleKey) {
    $values[$bundleKey] = 'bb_comment';
  }
  $values['ticket_id'] = $ticket->id();
  $comment = $storage->create($values);
  foreach (['bb_comment_type', 'body'] as $field) {
    if (!$comment->hasField($field)) {
      throw new \RuntimeException("bb_comment has no field $field; it has: " . implode(',', array_keys($comment->getFields())));
    }
  }
  $comment->save();
  $ids[] = $comment->id();
}

if ($ticket->hasField('comments')) {
  foreach ($ids as $id) {
    $ticket->get('comments')->appendItem($id);
  }
  $ticket->save();
}

// Verify: count the plan comments linked to this ticket by whatever field links them.
$ticket = $etm->getStorage('bb_ticket')->loadUnchanged($ticket->id());
$storage->resetCache();
$loaded = $storage->loadMultiple($ids);
$types = [];
foreach ($ids as $id) {
  $types[$id] = $loaded[$id]->get('bb_comment_type')->value ?? NULL;
}
$fields = array_keys(reset($loaded)->getFields());
$linked = [];
if (in_array('ticket_id', $fields, TRUE)) {
  $query = $storage->getQuery()->accessCheck(FALSE)->condition('ticket_id', $ticket->id());
  $linked = array_values($query->execute());
}
elseif ($ticket->hasField('comments')) {
  $linked = array_map('intval', array_column($ticket->get('comments')->getValue(), 'target_id'));
}
$plan = array_values(array_filter($linked, fn ($id) => ($types[$id] ?? NULL) === 'plan'));
$ticketRefs = [];
foreach ($loaded as $id => $c) {
  $ticketRefs[$id] = $c->hasField('ticket_id') ? ($c->get('ticket_id')->target_id ?? NULL) : 'n/a';
}
if (count($plan) < 2) {
  throw new \RuntimeException('Seeded plan comments not visible on the ticket: fields=' . implode(',', $fields)
    . ' types=' . json_encode($types) . ' ticket_id_refs=' . json_encode($ticketRefs)
    . ' linked=' . json_encode($linked) . ' ticket=' . $ticket->id());
}
print 'ids=' . implode(',', $ids) . ' plan_on_ticket=' . count($plan) . ' ticket=' . $ticket->id()
  . ' fields=' . implode(',', $fields) . "\n";
