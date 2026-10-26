// Genesis rich push: the Notification Service Extension that
// `@marktiderman/genesis-native/rich-push-plugin` adds to an Expo app.
//
// iOS runs it for a push with `mutable-content: 1` (Expo: `mutableContent: true`).
// It reads only the payload: it never fetches a message, so a push sent with
// hidden previews (neutral text, no sender fields) stays neutral.
//
// - `data.image` / `data.senderAvatar` (https only, and only from the hosts in
//   the Info.plist's `GenesisRichPushImageHosts` when the plugin's `imageHosts`
//   set it) are downloaded within the time limit and attached. A download that fails or runs late is skipped:
//   the notification is always shown, with what the payload already said.
// - A push in the `messages` category becomes a Communication Notification:
//   an incoming INSendMessageIntent with the sender (`senderName`,
//   `senderAvatar`, `senderId`), the conversation (`threadId`, else
//   `data.conversationId`) and, in a group, `groupName`. The sender's photo
//   shows on the notification, and Focus treats it as a message.
//
// `data` is where Expo's push service puts it (`body` in the APNs payload),
// or the payload's top level for a push sent to APNs directly.
//
// Nothing here logs what a notification says.

import Intents
import UserNotifications
import os

private let messagesCategory = "messages"
private let maxImageBytes = 10 * 1024 * 1024
// The extension has about 24 MB; only the avatar is read into memory, and small.
private let maxAvatarBytes = 1024 * 1024
private let maxURLLength = 1024
private let log = Logger(subsystem: "genesis.rich-push", category: "service")

final class NotificationService: UNNotificationServiceExtension {
  private let lock = NSLock()
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttempt: UNNotificationContent?
  private var session: URLSession?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    lock.lock()
    self.contentHandler = contentHandler
    self.bestAttempt = request.content
    lock.unlock()

    guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
      deliver(request.content)
      return
    }
    let data = payloadData(request.content.userInfo)
    let isMessage = content.categoryIdentifier == messagesCategory
    let imageURL = httpsURL(data["image"])
    let avatarURL = httpsURL(data["senderAvatar"])

    if imageURL == nil && avatarURL == nil && !isMessage {
      deliver(content)
      return
    }

    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 8
    configuration.timeoutIntervalForResource = 15
    configuration.httpCookieStorage = nil
    configuration.urlCache = nil
    let session = URLSession(configuration: configuration)
    lock.lock()
    self.session = session
    lock.unlock()

    let group = DispatchGroup()
    var imageFile: URL?
    var avatarData: Data?
    var avatarFile: URL?
    if let imageURL {
      group.enter()
      download(imageURL, session: session, keepBytes: false) { file, _ in
        imageFile = file
        group.leave()
      }
    }
    if let avatarURL {
      group.enter()
      download(avatarURL, session: session, keepBytes: true) { file, bytes in
        avatarFile = file
        avatarData = bytes
        group.leave()
      }
    }

    group.notify(queue: .global(qos: .userInitiated)) { [weak self] in
      // Already shown (the time ran out): don't donate or build anything more.
      guard let self, !self.delivered else { return }
      var attachments: [UNNotificationAttachment] = []
      if let imageFile, let attachment = self.attachment("image", imageFile) {
        attachments.append(attachment)
      }
      // On a message the avatar is the sender's photo (the intent's); on anything else it is attached.
      if !isMessage, let avatarFile, let attachment = self.attachment("avatar", avatarFile) {
        attachments.append(attachment)
      }
      content.attachments = attachments
      self.keep(content)

      guard isMessage else {
        self.deliver(content)
        return
      }
      self.communication(content, data: data, avatar: avatarData, avatarFile: avatarFile)
    }
  }

  override func serviceExtensionTimeWillExpire() {
    // Out of time: show what we have (at worst the push as it arrived), never nothing.
    lock.lock()
    let content = bestAttempt
    session?.invalidateAndCancel()
    lock.unlock()
    if let content { deliver(content) }
  }

  // MARK: Communication Notifications

  private func communication(_ content: UNMutableNotificationContent, data: [String: Any], avatar: Data?, avatarFile: URL?) {
    // Not a communication notification after all: the avatar is the picture, as on any other push.
    let plain = { [weak self] in
      guard let self else { return }
      if content.attachments.isEmpty, let avatarFile, let attachment = self.attachment("avatar", avatarFile) {
        content.attachments = [attachment]
      }
      self.deliver(content)
    }
    guard let name = text(data["senderName"]) else {
      // No sender (hidden previews send none): a plain notification, as sent.
      plain()
      return
    }
    let conversationId = text(content.threadIdentifier) ?? text(data["conversationId"])
    let senderId = text(data["senderId"]) ?? name
    let sender = INPerson(
      personHandle: INPersonHandle(value: senderId, type: .unknown),
      nameComponents: nil,
      displayName: name,
      image: avatar.map { INImage(imageData: $0) },
      contactIdentifier: nil,
      customIdentifier: senderId
    )
    let groupName = text(data["groupName"])
    var recipients: [INPerson]?
    if groupName != nil {
      // iOS draws a group (its name over the sender) when the message has more than one recipient.
      let me = INPerson(
        personHandle: INPersonHandle(value: "me", type: .unknown),
        nameComponents: nil,
        displayName: nil,
        image: nil,
        contactIdentifier: nil,
        customIdentifier: nil,
        isMe: true
      )
      recipients = [me, sender]
    }
    let intent = INSendMessageIntent(
      recipients: recipients,
      outgoingMessageType: .outgoingMessageText,
      content: content.body,
      speakableGroupName: groupName.map { INSpeakableString(spokenPhrase: $0) },
      conversationIdentifier: conversationId,
      serviceName: nil,
      sender: sender,
      attachments: nil
    )
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    interaction.donate { [weak self] error in
      guard let self else { return }
      if error != nil { log.error("donate failed") }
      do {
        let updated = try content.updating(from: intent)
        self.deliver(updated)
      } catch {
        // Without the entitlement (or on an iOS that refuses), the plain notification still shows.
        log.error("communication update failed")
        plain()
      }
    }
  }

  // MARK: Delivery

  private var delivered: Bool {
    lock.lock()
    defer { lock.unlock() }
    return contentHandler == nil
  }

  /// What `serviceExtensionTimeWillExpire` shows if the time runs out from here on.
  private func keep(_ content: UNNotificationContent) {
    lock.lock()
    bestAttempt = content.copy() as? UNNotificationContent
    lock.unlock()
  }

  private func deliver(_ content: UNNotificationContent) {
    lock.lock()
    let handler = contentHandler
    contentHandler = nil
    session?.finishTasksAndInvalidate()
    session = nil
    lock.unlock()
    handler?(content)
  }

  // MARK: Downloads

  private func download(_ url: URL, session: URLSession, keepBytes: Bool, done: @escaping (URL?, Data?) -> Void) {
    let task = session.downloadTask(with: url) { location, response, error in
      guard error == nil, let location,
        let http = response as? HTTPURLResponse, http.statusCode == 200,
        let mime = http.mimeType?.lowercased(), let ext = imageExtension(mime)
      else {
        log.error("image download skipped")
        done(nil, nil)
        return
      }
      do {
        let size = (try FileManager.default.attributesOfItem(atPath: location.path)[.size] as? NSNumber)?.intValue ?? 0
        guard size > 0, size <= maxImageBytes else {
          done(nil, nil)
          return
        }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appendingPathComponent("image.\(ext)")
        try FileManager.default.moveItem(at: location, to: file)
        // Bytes only for the avatar (the intent's INImage), and only a small one.
        done(file, keepBytes && size <= maxAvatarBytes ? try? Data(contentsOf: file) : nil)
      } catch {
        log.error("image save failed")
        done(nil, nil)
      }
    }
    task.resume()
  }

  private func attachment(_ id: String, _ file: URL) -> UNNotificationAttachment? {
    do {
      return try UNNotificationAttachment(identifier: id, url: file, options: nil)
    } catch {
      log.error("attachment refused")
      return nil
    }
  }
}

// MARK: Payload

/// `data`: Expo puts it under `body`; a push sent to APNs directly has it at the top level.
private func payloadData(_ userInfo: [AnyHashable: Any]) -> [String: Any] {
  if let body = userInfo["body"] as? [String: Any] { return body }
  if let body = userInfo["body"] as? String, let bytes = body.data(using: .utf8),
    let parsed = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any]
  {
    return parsed
  }
  var top: [String: Any] = [:]
  for (key, value) in userInfo {
    if let key = key as? String, key != "aps" { top[key] = value }
  }
  return top
}

private func text(_ value: Any?) -> String? {
  guard let string = value as? String else { return nil }
  let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
  return trimmed.isEmpty ? nil : String(trimmed.prefix(200))
}

/// The hosts images may come from (the plugin's `imageHosts`); none set means any https host.
private let imageHosts: [String] = ((Bundle.main.object(forInfoDictionaryKey: "GenesisRichPushImageHosts") as? [String]) ?? [])
  .map { $0.lowercased() }

private func allowedHost(_ host: String) -> Bool {
  if imageHosts.isEmpty { return true }
  let h = host.lowercased()
  return imageHosts.contains { h == $0 || h.hasSuffix("." + $0) }
}

/// Only https, with a host and no credentials, at most 1024 characters (the JS `isRichPushUrl`).
private func httpsURL(_ value: Any?) -> URL? {
  guard let string = value as? String, string.count <= maxURLLength,
    let components = URLComponents(string: string),
    components.scheme?.lowercased() == "https",
    let host = components.host, !host.isEmpty, allowedHost(host),
    components.user == nil, components.password == nil
  else { return nil }
  return components.url
}

private func imageExtension(_ mime: String) -> String? {
  switch mime {
  case "image/jpeg", "image/jpg": return "jpg"
  case "image/png": return "png"
  case "image/gif": return "gif"
  default: return nil
  }
}
