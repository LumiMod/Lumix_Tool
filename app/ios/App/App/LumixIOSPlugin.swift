import Capacitor
import UIKit
import UniformTypeIdentifiers

final class LumixBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(LumixIOSPlugin())
    }
}

@objc(LumixIOSPlugin)
final class LumixIOSPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "LumixIOSPlugin"
    let jsName = "LumixIOS"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickLutFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveVlt", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discoverCameras", returnType: CAPPluginReturnPromise)
    ]

    private let cameraDiscovery = CameraDiscovery()
    // The pending call and its picker belong to the main queue. The call stays
    // reserved while a file provider materializes or reads a selected document.
    private var pending: CAPPluginCall?
    private var picker: UIDocumentPickerViewController?
    private var exportDirectory: URL?

    deinit {
        cameraDiscovery.cancel()
        if let directory = exportDirectory { try? FileManager.default.removeItem(at: directory) }
    }

    @objc func discoverCameras(_ call: CAPPluginCall) {
        cameraDiscovery.discover { call.resolve($0) }
    }

    @objc func pickLutFile(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.reserve(call) else { return }
            // A Files provider can advertise a valid CUBE or VLT as generic data.
            // Validate the chosen file's extension and contents after selection.
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.data], asCopy: false)
            picker.allowsMultipleSelection = false
            self.present(picker)
        }
    }

    @objc func saveVlt(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.reserve(call) else { return }
            guard let name = call.getString("filename"),
                  name.range(of: #"\A[A-Za-z0-9]{1,8}\.[Vv][Ll][Tt]\z"#, options: .regularExpression) != nil,
                  let content = call.getString("content"), !content.isEmpty
            else {
                self.finish(.failure(LutFileError.invalid))
                return
            }
            guard content.utf8.count <= 1024 * 1024 else {
                self.finish(.failure(LutFileError.tooLarge))
                return
            }
            guard !content.utf8.contains(0) else {
                self.finish(.failure(LutFileError.invalid))
                return
            }
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            self.exportDirectory = dir
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: false)
                    let file = dir.appendingPathComponent(name)
                    try content.write(to: file, atomically: true, encoding: .utf8)
                    DispatchQueue.main.async {
                        self.present(UIDocumentPickerViewController(forExporting: [file], asCopy: true))
                    }
                } catch {
                    DispatchQueue.main.async { self.finish(.failure(error)) }
                }
            }
        }
    }

    private func reserve(_ call: CAPPluginCall) -> Bool {
        guard pending == nil else {
            call.reject("Finish the current Files operation first.", "FILE_BUSY")
            return false
        }
        pending = call
        return true
    }

    @MainActor private func present(_ controller: UIDocumentPickerViewController) {
        guard let host = bridge?.viewController, host.viewIfLoaded?.window != nil,
              host.presentedViewController == nil, !host.isBeingDismissed else {
            finish(.failure(LutFileError.pickerUnavailable))
            return
        }
        picker = controller
        controller.delegate = self
        controller.modalPresentationStyle = .formSheet
        controller.presentationController?.delegate = self
        host.present(controller, animated: true)
    }

    private func finish(_ result: Result<[String: Any], Error>) {
        guard let call = pending else { return }
        pending = nil
        picker = nil
        if let dir = exportDirectory {
            try? FileManager.default.removeItem(at: dir)
            exportDirectory = nil
        }
        switch result {
        case .success(let response): call.resolve(response)
        case .failure(let error):
            call.reject(error.localizedDescription, (error as? LutFileError)?.code ?? "FILE_IO")
        }
    }
}

extension LumixIOSPlugin: UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard controller === picker else { return }
        var result = ["canceled": true]
        if exportDirectory != nil { result["ok"] = false }
        finish(.success(result))
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        if let controller = presentationController.presentedViewController as? UIDocumentPickerViewController {
            documentPickerWasCancelled(controller)
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard controller === picker else { return }
        guard let url = urls.first else {
            documentPickerWasCancelled(controller)
            return
        }
        picker = nil
        if exportDirectory != nil {
            finish(.success(["ok": true, "filename": url.lastPathComponent]))
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let result = Result { try LutDocument.read(url) }
            DispatchQueue.main.async { self.finish(result) }
        }
    }
}

private enum LutFileError: LocalizedError {
    case tooLarge, invalid, pickerUnavailable

    var code: String {
        switch self {
        case .tooLarge: return "FILE_TOO_LARGE"
        case .invalid: return "INVALID_FILE"
        case .pickerUnavailable: return "PICKER_UNAVAILABLE"
        }
    }

    var errorDescription: String? {
        switch self {
        case .tooLarge: return "The LUT exceeds the file size limit."
        case .invalid: return "The LUT file name or text is invalid."
        case .pickerUnavailable: return "Files is unavailable. Try again when the app is visible."
        }
    }
}

private enum LutDocument {
    private static let maxBytes = 32 * 1024 * 1024

    static func read(_ url: URL) throws -> [String: Any] {
        guard url.isFileURL, ["cube", "vlt"].contains(url.pathExtension.lowercased()) else {
            throw LutFileError.invalid
        }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        var coordinatorError: NSError?
        var result: Result<String, Error>?
        NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: url, options: [], error: &coordinatorError) { readableURL in
            result = Result { try readText(readableURL) }
        }
        if let error = coordinatorError { throw error }
        guard let result else { throw LutFileError.invalid }
        return ["name": url.lastPathComponent, "text": try result.get()]
    }

    private static func readText(_ url: URL) throws -> String {
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        guard values.isRegularFile == true else { throw LutFileError.invalid }
        if let size = values.fileSize, size > maxBytes { throw LutFileError.tooLarge }
        let file = try FileHandle(forReadingFrom: url)
        defer { try? file.close() }
        var data = Data()
        while let chunk = try file.read(upToCount: min(256 * 1024, maxBytes + 1 - data.count)), !chunk.isEmpty {
            data.append(chunk)
            if data.count > maxBytes { throw LutFileError.tooLarge }
        }
        guard !data.isEmpty, !data.contains(0), let text = String(data: data, encoding: .utf8) else {
            throw LutFileError.invalid
        }
        return text
    }
}
