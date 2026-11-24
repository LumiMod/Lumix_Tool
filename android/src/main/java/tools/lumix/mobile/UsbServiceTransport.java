package tools.lumix.mobile;

import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;

/**
 * Android USB Host transport for Panasonic Lumix Service Mode (04DA:2370).
 */
public final class UsbServiceTransport implements LumixProtocol.Transport, AutoCloseable {
    private static final int TIMEOUT_MS = 4000;
    private static final long SETTLE_MS = 2L;

    private final UsbDeviceConnection conn;
    private final UsbInterface usbIf;
    private final UsbEndpoint epOut;
    private final UsbEndpoint epIn;

    public static UsbServiceTransport open(UsbManager usbManager, UsbDevice device) throws Exception {
        if (device.getInterfaceCount() < 1) {
            throw new Exception("USB 服务设备未暴露接口");
        }
        UsbInterface chosenIf = null;
        UsbEndpoint foundOut = null;
        UsbEndpoint foundIn = null;
        for (int idx = 0; idx < device.getInterfaceCount(); idx++) {
            UsbInterface intf = device.getInterface(idx);
            UsbEndpoint out = null;
            UsbEndpoint in = null;
            for (int e = 0; e < intf.getEndpointCount(); e++) {
                UsbEndpoint ep = intf.getEndpoint(e);
                if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                    if (ep.getDirection() == UsbConstants.USB_DIR_OUT) out = ep;
                    else if (ep.getDirection() == UsbConstants.USB_DIR_IN) in = ep;
                }
            }
            if (out != null && in != null) {
                chosenIf = intf;
                foundOut = out;
                foundIn = in;
                break;
            }
        }
        if (chosenIf == null || foundOut == null || foundIn == null) {
            throw new Exception("未找到服务模式 Bulk 传输端点");
        }
        UsbDeviceConnection connection = usbManager.openDevice(device);
        if (connection == null) {
            throw new Exception("无法打开 USB 设备，请重新插拔数据线");
        }
        if (!connection.claimInterface(chosenIf, true)) {
            connection.close();
            throw new Exception("无法独占相机服务接口，请关闭占用 USB 的其他应用");
        }
        return new UsbServiceTransport(connection, chosenIf, foundOut, foundIn);
    }

    private UsbServiceTransport(UsbDeviceConnection conn, UsbInterface usbIf, UsbEndpoint epOut, UsbEndpoint epIn) {
        this.conn = conn;
        this.usbIf = usbIf;
        this.epOut = epOut;
        this.epIn = epIn;
    }

    private void prepare(int index) throws Exception {
        int rc = conn.controlTransfer(0x40, 0x00, 0, index, null, 0, TIMEOUT_MS);
        if (rc < 0) {
            throw new Exception("USB 控制握手失败 (wIndex=" + index + ", rc=" + rc + ")");
        }
    }

    private void settle() throws InterruptedException {
        if (SETTLE_MS > 0) {
            Thread.sleep(SETTLE_MS);
        }
    }

    private void writeExact(byte[] data) throws Exception {
        int offset = 0;
        while (offset < data.length) {
            int written = conn.bulkTransfer(epOut, data, offset, data.length - offset, TIMEOUT_MS);
            if (written <= 0) {
                throw new Exception("USB Bulk 写入超时或中断 (" + offset + "/" + data.length + ")");
            }
            offset += written;
        }
    }

    private int readPacket(byte[] buffer, int maxLen, boolean fillExpected) throws Exception {
        int total = conn.bulkTransfer(epIn, buffer, 0, maxLen, TIMEOUT_MS);
        if (total < 0) {
            throw new Exception("USB Bulk 读取超时或断开");
        }
        if (fillExpected) {
            int maxPkt = Math.max(64, epIn.getMaxPacketSize());
            while (total > 0 && total < maxLen && (total % maxPkt) == 0) {
                int more = conn.bulkTransfer(epIn, buffer, total, maxLen - total, TIMEOUT_MS);
                if (more <= 0) break;
                total += more;
            }
        }
        return total;
    }

    @Override
    public synchronized int readHalf(long addr) throws Exception {
        byte[] tx = LumixProtocol.buildReadHalfFrame(addr);
        prepare(0);
        writeExact(tx);
        settle();

        byte[] typeBuf = new byte[64];
        prepare(1);
        int n1 = readPacket(typeBuf, 64, false);
        if (n1 != 1 || (typeBuf[0] & 0xFF) != LumixProtocol.REQUEST_KIND) {
            throw new Exception("0x9B 类型应答异常 (len=" + n1 + ")");
        }

        byte[] rx = new byte[64];
        prepare(1);
        int n2 = readPacket(rx, 64, false);
        return LumixProtocol.parseReadHalfReply(rx, n2);
    }

    @Override
    public synchronized void writeHalf(long addr, int value) throws Exception {
        byte[] tx = LumixProtocol.buildWriteHalfFrame(addr, value);
        prepare(0);
        writeExact(tx);
        settle();

        byte[] typeBuf = new byte[64];
        prepare(1);
        int n1 = readPacket(typeBuf, 64, false);
        if (n1 != 1) {
            throw new Exception("0x9C 写入类型应答异常 (len=" + n1 + ")");
        }
        int kind = typeBuf[0] & 0xFF;
        if (kind != LumixProtocol.REQUEST_KIND && kind != LumixProtocol.BLOCK_KIND) {
            throw new Exception("0x9C 未知应答标识: " + kind);
        }

        byte[] rx = new byte[64];
        prepare(1);
        int n2 = readPacket(rx, 64, false);
        LumixProtocol.validateWriteHalfReply(rx, n2);
    }

    @Override
    public synchronized byte[] readBlock(long alignedAddr) throws Exception {
        byte[] tx = LumixProtocol.buildReadBlockFrame(alignedAddr);
        prepare(0);
        writeExact(tx);
        settle();

        byte[] typeBuf = new byte[64];
        prepare(1);
        int n1 = readPacket(typeBuf, 64, false);
        if (n1 != 1 || (typeBuf[0] & 0xFF) != LumixProtocol.BLOCK_KIND) {
            throw new Exception("0x5C 块读取类型应答异常 (len=" + n1 + ")");
        }

        byte[] rx = new byte[LumixProtocol.BLOCK_FRAME_LEN];
        prepare(1);
        int n2 = readPacket(rx, LumixProtocol.BLOCK_FRAME_LEN, true);
        return LumixProtocol.parseReadBlockReply(rx, n2);
    }

    @Override
    public synchronized void close() {
        try { conn.releaseInterface(usbIf); } catch (Exception ignored) {}
        try { conn.close(); } catch (Exception ignored) {}
    }
}
