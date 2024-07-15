import { StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';

import EditScreenInfo from '@/components/EditScreenInfo';
import { Text, View } from '@/components/Themed';
import { useRouter } from 'expo-router';

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

// Sample book data (you can replace this with your actual data)
let books = [
  {
    id: 1,
    title: "Book Title 1",
    author: "Author 1",
    image: "https://via.placeholder.com/100",
    progress: 0,
    location: "file///path/to/book1.epub",
    sections: [1,2,3,4]
  },
  {
    id: 2,
    title: "Book Title 2",
    author: "Author 2",
    image: "https://via.placeholder.com/100",
    progress: 0,
    location: "file///path/to/book2.epub",
    sections: [1,2,3,4]
  },
  {
    id: 3,
    title: "Book Title 3",
    author: "Author 3",
    image: "https://via.placeholder.com/100",
    progress: 0,
    location: "file///path/to/book3.epub",
    sections: [1,2,3,4]
  },
  {
    id: 4,
    title: "Book Title 4",
    author: "Author 4",
    image: "https://via.placeholder.com/100",
    progress: 0,
    location: "file///path/to/book4.epub",
    sections: [1,2,3,4]
  },
  // Add more book objects as needed
];


const loadBooks = async (setBooks: any, setRefreshing: any) => {
  try {
    const booksJson = await FileSystem.readAsStringAsync(`${FileSystem.documentDirectory}books.json`);
    const loadedBooks = JSON.parse(booksJson);
    setBooks(loadedBooks);
  } catch (error) {
    console.error("Error reading or parsing books.json:", error);
  } finally {
    setRefreshing(false);
  }
};

export default function TabOneScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [books, setBooks] = useState<{ id: number; title: string; author: string; image: string; progress: number; location: string; }[]>([]);

  useEffect(() => {
    loadBooks(setBooks, setRefreshing);
  }, []);

  const handleBookPress = (book: any) => {
    console.log(`Selected book: ${book.title}`);
    router.push({
      pathname: '/reader',
      params: { bookTitle: book.title, bookLocation: book.location, bookID: book.id, bookProgress: book.progress },
    });
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadBooks(setBooks, setRefreshing);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {books.map((book) => (
          <TouchableOpacity key={book.id} onPress={() => handleBookPress(book)}>
            <BookContainer book={book} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const blurhash =
  '|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[';


function BookContainer({ book }: { book: any }) {
  return (
    <View style={styles.bookContainer}>
      <Image source={{ uri: book.image }} style={styles.bookImage} placeholder={{ blurhash }} />
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
