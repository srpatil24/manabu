import { StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';

import EditScreenInfo from '@/components/EditScreenInfo';
import { Text, View } from '@/components/Themed';

// Sample book data (you can replace this with your actual data)
const books = [
  {
    id: 1,
    title: "Book Title 1",
    author: "Author 1",
    image: "https://via.placeholder.com/100"
  },
  {
    id: 2,
    title: "Book Title 2",
    author: "Author 2",
    image: "https://via.placeholder.com/100"
  },
  {
    id: 3,
    title: "Book Title 3",
    author: "Author 3",
    image: "https://via.placeholder.com/100"
  },
  {
    id: 4,
    title: "Book Title 4",
    author: "Author 4",
    image: "https://via.placeholder.com/100"
  },
  // Add more book objects as needed
];


export default function TabOneScreen() {

  const handleBookPress = (book: any) => {
    console.log(`Selected book: ${book.title}`);
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContainer}>

        {books.map((book) => (
          <TouchableOpacity key={book.id} onPress={() => handleBookPress(book)}>
            <BookContainer book={book} />
          </TouchableOpacity>
          ))}

          </ScrollView>
    </View>
  );
}

function BookContainer({ book }: { book: any }) {
  return (
    <View style={styles.bookContainer}>
      <Image source={{ uri: book.image }} style={styles.bookImage} />
      <View style={styles.textContainer}>
        <Text style={styles.bookTitle}>{book.title}</Text>
        <Text style={styles.bookAuthor}>{book.author}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
  bookContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 200,
    borderWidth: 1,
    padding: 10,
    marginBottom: 10,
  },
  bookTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  bookAuthor: {
    fontSize: 15,
    color: 'gray',
    marginTop: 5,
  },
  bookCover: {
    width: 100,
    height: '100%',
  },
  bookImage: {
    width: 100,
    height: '100%',
  },
  scrollContainer: {
    width: '100%',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    marginLeft: 10,
  }
});
