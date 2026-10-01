using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BikeLog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialMaintenance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Bikes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Bikes", x => x.Id);
                    table.UniqueConstraint("AK_Bikes_OwnerId_Id", x => new { x.OwnerId, x.Id });
                }
            );

            migrationBuilder.CreateTable(
                name: "Components",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    Model = table.Column<string>(type: "text", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Components", x => x.Id);
                    table.UniqueConstraint(
                        "AK_Components_OwnerId_Id",
                        x => new { x.OwnerId, x.Id }
                    );
                    table.CheckConstraint("CK_Component_Type", "\"Type\" = 'Chain'");
                }
            );

            migrationBuilder.CreateTable(
                name: "Rides",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BikeId = table.Column<Guid>(type: "uuid", nullable: false),
                    StartUtc = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    DistanceMetres = table.Column<long>(type: "bigint", nullable: false),
                    DurationSeconds = table.Column<long>(type: "bigint", nullable: true),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Rides", x => x.Id);
                    table.UniqueConstraint("AK_Rides_OwnerId_Id", x => new { x.OwnerId, x.Id });
                    table.CheckConstraint("CK_Ride_Distance", "\"DistanceMetres\" > 0");
                    table.CheckConstraint(
                        "CK_Ride_Duration",
                        "\"DurationSeconds\" IS NULL OR \"DurationSeconds\" > 0"
                    );
                    table.ForeignKey(
                        name: "FK_Rides_Bikes_OwnerId_BikeId",
                        columns: x => new { x.OwnerId, x.BikeId },
                        principalTable: "Bikes",
                        principalColumns: new[] { "OwnerId", "Id" },
                        onDelete: ReferentialAction.Restrict
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "ComponentUsages",
                columns: table => new
                {
                    ComponentId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    LifetimeMetres = table.Column<long>(type: "bigint", nullable: false),
                    LifetimeSeconds = table.Column<long>(type: "bigint", nullable: false),
                    HasUnknownDuration = table.Column<bool>(type: "boolean", nullable: false),
                    CalculatedAtUtc = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ComponentUsages", x => x.ComponentId);
                    table.ForeignKey(
                        name: "FK_ComponentUsages_Components_OwnerId_ComponentId",
                        columns: x => new { x.OwnerId, x.ComponentId },
                        principalTable: "Components",
                        principalColumns: new[] { "OwnerId", "Id" },
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "Installations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ComponentId = table.Column<Guid>(type: "uuid", nullable: false),
                    BikeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Position = table.Column<string>(type: "text", nullable: false),
                    StartUtc = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    EndUtc = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Installations", x => x.Id);
                    table.UniqueConstraint(
                        "AK_Installations_OwnerId_Id",
                        x => new { x.OwnerId, x.Id }
                    );
                    table.CheckConstraint(
                        "CK_Installation_Interval",
                        "\"EndUtc\" IS NULL OR \"EndUtc\" > \"StartUtc\""
                    );
                    table.CheckConstraint("CK_Installation_Position", "\"Position\" = 'Chain'");
                    table.ForeignKey(
                        name: "FK_Installations_Bikes_OwnerId_BikeId",
                        columns: x => new { x.OwnerId, x.BikeId },
                        principalTable: "Bikes",
                        principalColumns: new[] { "OwnerId", "Id" },
                        onDelete: ReferentialAction.Restrict
                    );
                    table.ForeignKey(
                        name: "FK_Installations_Components_OwnerId_ComponentId",
                        columns: x => new { x.OwnerId, x.ComponentId },
                        principalTable: "Components",
                        principalColumns: new[] { "OwnerId", "Id" },
                        onDelete: ReferentialAction.Restrict
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "MaintenanceRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BikeId = table.Column<Guid>(type: "uuid", nullable: false),
                    ComponentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Task = table.Column<string>(type: "text", nullable: false),
                    PerformedUtc = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    Cost = table.Column<decimal>(
                        type: "numeric(18,2)",
                        precision: 18,
                        scale: 2,
                        nullable: true
                    ),
                    Currency = table.Column<string>(type: "text", nullable: true),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MaintenanceRecords", x => x.Id);
                    table.UniqueConstraint(
                        "AK_MaintenanceRecords_OwnerId_Id",
                        x => new { x.OwnerId, x.Id }
                    );
                    table.CheckConstraint(
                        "CK_Maintenance_Cost",
                        "(\"Cost\" IS NULL AND \"Currency\" IS NULL) OR (\"Cost\" IS NOT NULL AND \"Cost\" >= 0 AND \"Currency\" ~ '^[A-Z]{3}$')"
                    );
                    table.ForeignKey(
                        name: "FK_MaintenanceRecords_Bikes_OwnerId_BikeId",
                        columns: x => new { x.OwnerId, x.BikeId },
                        principalTable: "Bikes",
                        principalColumns: new[] { "OwnerId", "Id" },
                        onDelete: ReferentialAction.Restrict
                    );
                    table.ForeignKey(
                        name: "FK_MaintenanceRecords_Components_OwnerId_ComponentId",
                        columns: x => new { x.OwnerId, x.ComponentId },
                        principalTable: "Components",
                        principalColumns: new[] { "OwnerId", "Id" },
                        onDelete: ReferentialAction.Restrict
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "InstallationUsages",
                columns: table => new
                {
                    InstallationId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Metres = table.Column<long>(type: "bigint", nullable: false),
                    Seconds = table.Column<long>(type: "bigint", nullable: false),
                    HasUnknownDuration = table.Column<bool>(type: "boolean", nullable: false),
                    CalculatedAtUtc = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InstallationUsages", x => x.InstallationId);
                    table.ForeignKey(
                        name: "FK_InstallationUsages_Installations_OwnerId_InstallationId",
                        columns: x => new { x.OwnerId, x.InstallationId },
                        principalTable: "Installations",
                        principalColumns: new[] { "OwnerId", "Id" },
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateIndex(
                name: "IX_Bikes_OwnerId",
                table: "Bikes",
                column: "OwnerId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_Components_OwnerId",
                table: "Components",
                column: "OwnerId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_ComponentUsages_OwnerId_ComponentId",
                table: "ComponentUsages",
                columns: new[] { "OwnerId", "ComponentId" },
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_Installations_OwnerId",
                table: "Installations",
                column: "OwnerId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_Installations_OwnerId_BikeId_StartUtc",
                table: "Installations",
                columns: new[] { "OwnerId", "BikeId", "StartUtc" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_Installations_OwnerId_ComponentId",
                table: "Installations",
                columns: new[] { "OwnerId", "ComponentId" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_InstallationUsages_OwnerId_InstallationId",
                table: "InstallationUsages",
                columns: new[] { "OwnerId", "InstallationId" },
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_MaintenanceRecords_OwnerId",
                table: "MaintenanceRecords",
                column: "OwnerId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_MaintenanceRecords_OwnerId_BikeId_PerformedUtc",
                table: "MaintenanceRecords",
                columns: new[] { "OwnerId", "BikeId", "PerformedUtc" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_MaintenanceRecords_OwnerId_ComponentId",
                table: "MaintenanceRecords",
                columns: new[] { "OwnerId", "ComponentId" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_Rides_OwnerId",
                table: "Rides",
                column: "OwnerId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_Rides_OwnerId_BikeId_StartUtc",
                table: "Rides",
                columns: new[] { "OwnerId", "BikeId", "StartUtc" }
            );
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "ComponentUsages");

            migrationBuilder.DropTable(name: "InstallationUsages");

            migrationBuilder.DropTable(name: "MaintenanceRecords");

            migrationBuilder.DropTable(name: "Rides");

            migrationBuilder.DropTable(name: "Installations");

            migrationBuilder.DropTable(name: "Bikes");

            migrationBuilder.DropTable(name: "Components");
        }
    }
}
