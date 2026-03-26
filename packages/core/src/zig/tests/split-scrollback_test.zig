const std = @import("std");
const split_scrollback = @import("../split-scrollback.zig");
const utf8 = @import("../utf8.zig");

test "split scrollback starts empty" {
    var scrollback = split_scrollback.SplitScrollback{};

    try std.testing.expectEqual(@as(u32, 0), scrollback.published_rows);
    try std.testing.expectEqual(@as(u32, 0), scrollback.tail_column);
    try std.testing.expectEqual(@as(u32, 0), scrollback.renderOffset(6));
}

test "split scrollback text bridge tracks newline commits" {
    var scrollback = split_scrollback.SplitScrollback{};

    scrollback.publishTextBridge("a\n", 40, .unicode);

    try std.testing.expectEqual(@as(u32, 2), scrollback.published_rows);
    try std.testing.expectEqual(@as(u32, 0), scrollback.tail_column);
    try std.testing.expectEqual(@as(u32, 2), scrollback.renderOffset(6));
}

test "split scrollback text bridge carries exact wraps across commits" {
    var scrollback = split_scrollback.SplitScrollback{};

    scrollback.publishTextBridge("abcd", 4, .unicode);
    try std.testing.expectEqual(@as(u32, 1), scrollback.published_rows);
    try std.testing.expectEqual(@as(u32, 4), scrollback.tail_column);

    scrollback.publishTextBridge("e", 4, .unicode);
    try std.testing.expectEqual(@as(u32, 2), scrollback.published_rows);
    try std.testing.expectEqual(@as(u32, 1), scrollback.tail_column);
}

test "split scrollback reset seeds pinned rows" {
    var scrollback = split_scrollback.SplitScrollback{};

    scrollback.reset(6);
    try std.testing.expectEqual(@as(u32, 6), scrollback.published_rows);
    try std.testing.expectEqual(@as(u32, 0), scrollback.tail_column);
    try std.testing.expectEqual(@as(u32, 6), scrollback.renderOffset(6));

    scrollback.publishTextBridge("x", 40, utf8.WidthMethod.unicode);
    try std.testing.expectEqual(@as(u32, 6), scrollback.renderOffset(6));
    try std.testing.expectEqual(@as(u32, 1), scrollback.tail_column);
}
