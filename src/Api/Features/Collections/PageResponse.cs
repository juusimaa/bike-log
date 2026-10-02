using BikeLog.Api.Features.Components;
using BikeLog.Api.Features.Installations;

namespace BikeLog.Api.Features.Collections;

public sealed record PageResponse<T>(IReadOnlyList<T> Items, string? NextCursor);

public sealed record InstallationListItem(
    InstallationResponse Installation,
    ComponentResponse Component
);
