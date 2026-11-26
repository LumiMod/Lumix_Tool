import Foundation
import ImageCaptureCore

final class CameraDiscovery: NSObject, ICDeviceBrowserDelegate {
    typealias Reply = ([String: Any]) -> Void

    private var browser: ICDeviceBrowser?
    private var pending: [Reply] = []
    private var deadline: DispatchWorkItem?

    func discover(completion: @escaping Reply) {
        DispatchQueue.main.async {
            #if targetEnvironment(simulator)
            completion(["status": "unavailable", "devices": []])
            #else
            self.pending.append(completion)
            guard self.browser == nil else { return }

            let browser = ICDeviceBrowser()
            self.browser = browser
            browser.delegate = self
            if #available(iOS 15.2, *) {
                let mask = ICDeviceTypeMask.camera.rawValue | ICDeviceLocationTypeMask.local.rawValue
                browser.browsedDeviceTypeMask = ICDeviceTypeMask(rawValue: mask) ?? .camera
            }

            // iOS has no callback for completion of the initial local enumeration.
            // Snapshot the browser's live list after a bounded detection window.
            let deadline = DispatchWorkItem {
                guard self.browser === browser else { return }
                self.collect(from: browser)
            }
            self.deadline = deadline
            DispatchQueue.main.asyncAfter(deadline: .now() + .seconds(3), execute: deadline)
            browser.start()
            #endif
        }
    }

    func cancel() {
        DispatchQueue.main.async {
            if self.browser != nil { self.finish(status: "unavailable") }
        }
    }

    private func collect(from browser: ICDeviceBrowser) {
        guard browser.isBrowsing, !browser.isSuspended else {
            finish(status: "unavailable")
            return
        }
        let cameras = (browser.devices ?? []).compactMap { device -> [String: Any]? in
            guard let camera = device as? ICCameraDevice else { return nil }
            var info: [String: Any] = ["name": camera.name ?? ""]
            if (1...65535).contains(camera.usbVendorID) { info["vendorId"] = Int(camera.usbVendorID) }
            if (1...65535).contains(camera.usbProductID) { info["productId"] = Int(camera.usbProductID) }
            return info
        }
        // ImageCaptureCore exposes permissions for camera contents and control,
        // but no separate discovery permission. An empty list only describes this scan.
        finish(status: cameras.isEmpty ? "empty" : "found", devices: cameras)
    }

    private func finish(status: String, devices: [[String: Any]] = []) {
        deadline?.cancel()
        deadline = nil
        browser?.delegate = nil
        browser?.stop()
        browser = nil
        let replies = pending
        pending.removeAll()
        for reply in replies { reply(["status": status, "devices": devices]) }
    }

    // The browser maintains .devices across these required delegate callbacks.
    func deviceBrowser(_ browser: ICDeviceBrowser, didAdd device: ICDevice, moreComing: Bool) {}
    func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) {}

    func deviceBrowserWillSuspendOperations(_ browser: ICDeviceBrowser) {
        DispatchQueue.main.async {
            guard self.browser === browser else { return }
            self.finish(status: "unavailable")
        }
    }
}
