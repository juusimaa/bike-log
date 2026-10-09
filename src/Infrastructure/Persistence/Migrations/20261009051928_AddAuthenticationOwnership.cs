using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BikeLog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAuthenticationOwnership : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BikeLogUsers",
                columns: table => new
                {
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Issuer = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    Subject = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    DisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BikeLogUsers", x => x.OwnerId);
                });

            migrationBuilder.CreateTable(
                name: "OidcLoginTransactions",
                columns: table => new
                {
                    StateHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    EncryptedNonceAndVerifier = table.Column<string>(type: "text", nullable: false),
                    ReturnPath = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OidcLoginTransactions", x => x.StateHash);
                });

            migrationBuilder.CreateTable(
                name: "WebSessions",
                columns: table => new
                {
                    SessionIdHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    EncryptedTokens = table.Column<string>(type: "text", nullable: false),
                    Issuer = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    Subject = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RotationVersion = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WebSessions", x => x.SessionIdHash);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BikeLogUsers_Issuer_Subject",
                table: "BikeLogUsers",
                columns: new[] { "Issuer", "Subject" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OidcLoginTransactions_ExpiresAtUtc",
                table: "OidcLoginTransactions",
                column: "ExpiresAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_WebSessions_ExpiresAtUtc",
                table: "WebSessions",
                column: "ExpiresAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_WebSessions_Issuer_Subject",
                table: "WebSessions",
                columns: new[] { "Issuer", "Subject" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BikeLogUsers");

            migrationBuilder.DropTable(
                name: "OidcLoginTransactions");

            migrationBuilder.DropTable(
                name: "WebSessions");
        }
    }
}
