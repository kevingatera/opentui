const utf8 = @import("utf8.zig");

const TEXT_BRIDGE_TAB_WIDTH: u8 = 4;

fn findTextRunEnd(output: []const u8, start: usize) usize {
    var end = start;

    while (end < output.len) : (end += 1) {
        const byte = output[end];
        if (byte == '\r' or byte == '\n') {
            break;
        }
    }

    return end;
}

pub const SplitScrollback = struct {
    published_rows: u32 = 0,
    tail_column: u32 = 0,

    pub fn reset(self: *SplitScrollback, seed_rows: u32) void {
        self.published_rows = seed_rows;
        self.tail_column = 0;
    }

    pub fn renderOffset(self: *const SplitScrollback, pinned_render_offset: u32) u32 {
        if (pinned_render_offset == 0) {
            return 0;
        }

        return @min(self.published_rows, pinned_render_offset);
    }

    pub fn publishTextBridge(self: *SplitScrollback, output: []const u8, width: u32, width_method: utf8.WidthMethod) void {
        const safe_width = @max(width, @as(u32, 1));
        var pos: usize = 0;

        while (pos < output.len) {
            const byte = output[pos];
            switch (byte) {
                '\n' => {
                    if (self.published_rows == 0) {
                        self.published_rows = 1;
                    }
                    self.published_rows += 1;
                    self.tail_column = 0;
                    pos += 1;
                },
                '\r' => {
                    if (self.published_rows > 0) {
                        self.tail_column = 0;
                    }
                    pos += 1;
                },
                else => {
                    const run_end = findTextRunEnd(output, pos);
                    self.publishPrintableRun(output[pos..run_end], safe_width, width_method);
                    pos = run_end;
                },
            }
        }
    }

    fn publishPrintableRun(self: *SplitScrollback, run: []const u8, width: u32, width_method: utf8.WidthMethod) void {
        if (run.len == 0) {
            return;
        }

        var remaining = run;

        while (remaining.len > 0) {
            if (self.published_rows == 0) {
                self.published_rows = 1;
            }

            if (self.tail_column >= width) {
                self.published_rows += 1;
                self.tail_column = 0;
            }

            const is_ascii_only = utf8.isAsciiOnly(remaining);
            const available_width = width - self.tail_column;
            const wrap = utf8.findWrapPosByWidth(
                remaining,
                available_width,
                TEXT_BRIDGE_TAB_WIDTH,
                is_ascii_only,
                width_method,
            );

            if (wrap.byte_offset == remaining.len) {
                self.tail_column += wrap.columns_used;
                return;
            }

            if (wrap.byte_offset == 0) {
                if (self.tail_column > 0) {
                    self.published_rows += 1;
                    self.tail_column = 0;
                    continue;
                }

                const first = utf8.findPosByWidth(
                    remaining,
                    1,
                    TEXT_BRIDGE_TAB_WIDTH,
                    is_ascii_only,
                    true,
                    width_method,
                );

                if (first.byte_offset == 0) {
                    remaining = remaining[1..];
                    self.tail_column = @min(width, @as(u32, 1));
                } else {
                    remaining = remaining[first.byte_offset..];
                    self.tail_column = @min(width, @max(first.columns_used, @as(u32, 1)));
                }

                continue;
            }

            remaining = remaining[wrap.byte_offset..];
            self.tail_column += wrap.columns_used;

            if (remaining.len > 0) {
                self.published_rows += 1;
                self.tail_column = 0;
            }
        }
    }
};
