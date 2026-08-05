using FamilyTree.Domain;
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

/// <summary>Round-trips the Firestore document mappers for residences. Residences carry far
/// more serialization surface than any scalar override field — a nested locale object, two
/// doubles, and two nullable ints stored as Firestore longs — and the mappers are only
/// reachable in production behind a live FirestoreDb, so they are exercised directly here.</summary>
public sealed class FirestoreResidenceMappingTests
{
    private static Residence RoundTrip(Residence source)
    {
        var written = FirestorePersonOverrideStore.ResidenceMap(source);
        // Firestore hands values back non-null-typed, dropping keys whose value was null —
        // mirror that, or the read side is tested against a shape it never actually sees.
        var read = written
            .Where(kv => kv.Value is not null)
            .ToDictionary(kv => kv.Key, kv => kv.Value!);
        return FirestorePersonOverrideStore.ReadResidence(read);
    }

    [Fact]
    public void ResidenceMapThenReadResidence_WhenEveryFieldIsSet_ShouldPreserveAllOfThem()
    {
        var source = new Residence
        {
            Place = new LocalizedText { Ru = "Мінск", Be = "Мінск", En = "Minsk" },
            FromYear = 1920,
            ToYear = 1930,
            Lat = 53.9,
            Lng = 27.5667,
            MapUrl = "https://www.google.com/maps/search/?api=1&query=53.9,27.5667"
        };

        var result = RoundTrip(source);

        result.Should().BeEquivalentTo(source);
    }

    [Fact]
    public void ResidenceMapThenReadResidence_WhenOptionalFieldsAreNull_ShouldStayNull()
    {
        var source = new Residence
        {
            Place = new LocalizedText { Ru = null, Be = null, En = "Kraków" },
            FromYear = null,
            ToYear = null,
            Lat = null,
            Lng = null,
            MapUrl = null
        };

        var result = RoundTrip(source);

        result.Should().BeEquivalentTo(source);
    }

    /// <summary>Years are written as Firestore longs; the read side has to narrow them back to
    /// int rather than silently drop them by type-testing for int.</summary>
    [Fact]
    public void ResidenceMap_WhenYearsAreSet_ShouldWriteThemAsLongsThatReadBackAsInts()
    {
        var written = FirestorePersonOverrideStore.ResidenceMap(new Residence
        {
            Place = new LocalizedText { En = "Minsk" },
            FromYear = 1920,
            ToYear = 1930
        });

        written["fromYear"].Should().BeOfType<long>().And.Be(1920L);
        written["toYear"].Should().BeOfType<long>().And.Be(1930L);

        var read = FirestorePersonOverrideStore.ReadResidence(
            written.Where(kv => kv.Value is not null).ToDictionary(kv => kv.Key, kv => kv.Value!));
        read.FromYear.Should().Be(1920);
        read.ToYear.Should().Be(1930);
    }

    /// <summary>A blank locale must come back as null, not "", so it stays distinguishable from
    /// a locale the editor deliberately filled in.</summary>
    [Fact]
    public void ReadResidence_WhenALocaleIsAnEmptyString_ShouldReadItAsNull()
    {
        var read = FirestorePersonOverrideStore.ReadResidence(new Dictionary<string, object>
        {
            ["placeRu"] = "",
            ["placeEn"] = "Minsk"
        });

        read.Place.Ru.Should().BeNull();
        read.Place.En.Should().Be("Minsk");
    }

    [Fact]
    public void ReadResidence_WhenKeysAreAbsentEntirely_ShouldReturnAnAllNullResidence()
    {
        var read = FirestorePersonOverrideStore.ReadResidence([]);

        read.Place.Ru.Should().BeNull();
        read.Place.Be.Should().BeNull();
        read.Place.En.Should().BeNull();
        read.FromYear.Should().BeNull();
        read.ToYear.Should().BeNull();
        read.Lat.Should().BeNull();
        read.Lng.Should().BeNull();
        read.MapUrl.Should().BeNull();
    }
}
