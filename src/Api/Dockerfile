# syntax=docker/dockerfile:1
# Build context: repository root. Targets:
#   api        (default) the ASP.NET Core API, also used for operator commands
#   migrations a self-contained EF Core migration bundle; run it explicitly,
#              never at API startup
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0.401@sha256:e70cdb7f80b0348f5cb85f19a8f670fca061f033d57eed12fa003d58b0e06317 AS build
WORKDIR /repo
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY .config/dotnet-tools.json .config/
COPY src/Domain/*.csproj src/Domain/packages.lock.json src/Domain/
COPY src/Infrastructure/*.csproj src/Infrastructure/packages.lock.json src/Infrastructure/
COPY src/Api/*.csproj src/Api/packages.lock.json src/Api/
# The lock files are platform-neutral, so restore without a runtime identifier.
RUN dotnet tool restore \
    && dotnet restore src/Api/BikeLog.Api.csproj --locked-mode
COPY src src

FROM build AS publish-api
# A portable, framework-dependent build runs on both amd64 and arm64.
RUN dotnet publish src/Api/BikeLog.Api.csproj -c Release --no-restore -p:UseAppHost=false -o /out

FROM build AS publish-migrations
ARG TARGETARCH
# The bundle is a native executable for the target platform; Docker's amd64 is
# .NET's x64. Its own restore adds the runtime identifier to the lock graph.
RUN rid=linux-$( [ "$TARGETARCH" = amd64 ] && echo x64 || echo "$TARGETARCH" ) \
    && AccessMode=Synthetic dotnet ef migrations bundle --project src/Infrastructure --startup-project src/Api \
        --self-contained -r $rid -o /out/efbundle

FROM mcr.microsoft.com/dotnet/runtime-deps:10.0.12@sha256:12dd273c196e92aa91542749b8df0996f497f812811abba9e6613b484f681dd0 AS migrations
WORKDIR /app
COPY --from=publish-migrations /out/efbundle ./
# Building the startup host needs an access mode; the bundle only reads
# ConnectionStrings__Postgres and never serves requests.
ENV AccessMode=Synthetic
USER $APP_UID
ENTRYPOINT ["./efbundle"]

FROM mcr.microsoft.com/dotnet/aspnet:10.0.12@sha256:222759b391a1aaf241166672c8f99b2d4ada452e7b5319f3c6e8f265a37b5ad4 AS api
WORKDIR /app
COPY --from=publish-api /out ./
# The web proxy expects the API on port 5080.
ENV ASPNETCORE_HTTP_PORTS=5080
USER $APP_UID
EXPOSE 5080
ENTRYPOINT ["dotnet", "BikeLog.Api.dll"]
