using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BikeLog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ChainringOptionalShifters : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_PositionExemption_Reason",
                table: "PositionExemptions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Installation_Position",
                table: "Installations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Component_Type",
                table: "Components");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PositionExemption_Reason",
                table: "PositionExemptions",
                sql: "(\"Position\", \"Reason\") IN (('FrontDerailleur', 'NoneFitted'), ('Shifters', 'NoneFitted'), ('FrontInnerTube', 'Tubeless'), ('RearInnerTube', 'Tubeless'))");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Installation_Position",
                table: "Installations",
                sql: "\"Position\" IN ('Fork', 'BottomBracket', 'Handlebar', 'HandlebarTape', 'Saddle', 'Seatpost', 'Pedals', 'FrontThroughAxle', 'RearThroughAxle', 'FrontDerailleur', 'RearDerailleur', 'Shifters', 'Cassette', 'Chain', 'FrontBrake', 'RearBrake', 'FrontBrakeLever', 'RearBrakeLever', 'Crankset', 'Chainring', 'FrontRim', 'RearRim', 'FrontTyre', 'RearTyre', 'FrontDiscRotor', 'RearDiscRotor', 'FrontInnerTube', 'RearInnerTube')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Component_Type",
                table: "Components",
                sql: "\"Type\" IN ('Fork', 'BottomBracket', 'Handlebar', 'HandlebarTape', 'Saddle', 'Seatpost', 'Pedals', 'ThroughAxle', 'FrontDerailleur', 'RearDerailleur', 'Shifters', 'Cassette', 'Chain', 'Brake', 'BrakeLever', 'Crankset', 'Chainring', 'Rim', 'Tyre', 'DiscRotor', 'InnerTube')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_PositionExemption_Reason",
                table: "PositionExemptions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Installation_Position",
                table: "Installations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Component_Type",
                table: "Components");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PositionExemption_Reason",
                table: "PositionExemptions",
                sql: "(\"Position\", \"Reason\") IN (('FrontDerailleur', 'NoneFitted'), ('FrontInnerTube', 'Tubeless'), ('RearInnerTube', 'Tubeless'))");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Installation_Position",
                table: "Installations",
                sql: "\"Position\" IN ('Fork', 'BottomBracket', 'Handlebar', 'HandlebarTape', 'Saddle', 'Seatpost', 'Pedals', 'FrontThroughAxle', 'RearThroughAxle', 'FrontDerailleur', 'RearDerailleur', 'Shifters', 'Cassette', 'Chain', 'FrontBrake', 'RearBrake', 'FrontBrakeLever', 'RearBrakeLever', 'Crankset', 'FrontRim', 'RearRim', 'FrontTyre', 'RearTyre', 'FrontDiscRotor', 'RearDiscRotor', 'FrontInnerTube', 'RearInnerTube')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Component_Type",
                table: "Components",
                sql: "\"Type\" IN ('Fork', 'BottomBracket', 'Handlebar', 'HandlebarTape', 'Saddle', 'Seatpost', 'Pedals', 'ThroughAxle', 'FrontDerailleur', 'RearDerailleur', 'Shifters', 'Cassette', 'Chain', 'Brake', 'BrakeLever', 'Crankset', 'Rim', 'Tyre', 'DiscRotor', 'InnerTube')");
        }
    }
}
